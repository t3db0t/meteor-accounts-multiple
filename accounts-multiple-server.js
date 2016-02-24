/* globals AccountsMultiple: true */
"use strict";

console.log("t3db0t:accounts-multiple");

AccountsMultiple = {
  _stoppers: []
};

// Get/set the attempting user associated with an attempt. We store it in
// DDP._CurrentInvocation.get() because that appears to have been designed for
// exactly this job.
// NOTE: We do NOT store it on on attempt.connection or Fiber.current
// because:
// 1) we'd need to clear the attempting user in both an onLogin and an
//    onLoginFailure callback that is always present, and
// 2) we'd need to store a separate attempting user for each callback set
//    registered, so that a callback from one set doesn't clear the attempted
//    user before a callback from another set runs, and
// 3) if we use attempt.connection, we'd need to ensure that multiple Fibers
//    can't handle login attempts on the same connection simultaneously. This
//    might be true, I just don't know.
var AttemptingUser = {
  get: function (/* attempt (unused) */) {
    return DDP._CurrentInvocation.get().accountsMultipleAttemptingUser;
  },

  set: function (attempt, user) {
    DDP._CurrentInvocation.get().accountsMultipleAttemptingUser = user;
  }
};

AccountsMultiple.register = function(cbs) {
  var validateLoginStopper, onLoginStopper, onLoginFailureStopper;
  // If any of the callbacks is provided, we need to register a
  // validateLoginAttempt handler to at least capture the attempting user.
  if (cbs.validateSwitch || cbs.onSwitch || cbs.onSwitchFailure) {
    // Use an empty validateSwitch callback if necessary
    var cb = cbs.validateSwitch || function () { return true; };
    var noUserCB = cbs.onNoAttemptingUser || function () { return true; };
    // Workaround a meteor bug when adding the validateLoginAttempt handler
      validateLoginStopper =
        Accounts.validateLoginAttempt(createValidateLoginAttemptHandler(cb, noUserCB));
  }
  if (cbs.onSwitch) {
    onLoginStopper = Accounts.onLogin(function(attempt) {
      var attemptingUser = AttemptingUser.get(attempt);
      if (attemptingUser) {
        return cbs.onSwitch(attemptingUser, attempt);
      }
    });
  }
  if (cbs.onSwitchFailure) {
    onLoginFailureStopper = Accounts.onLoginFailure(function(attempt) {
      var attemptingUser = AttemptingUser.get(attempt);
      if (attemptingUser) {
        return cbs.onSwitchFailure(attemptingUser, attempt);
      }
    });
  }
  var stopper = {
    stop: function() {
      if (validateLoginStopper) { validateLoginStopper.stop(); }
      if (onLoginStopper) { onLoginStopper.stop(); }
      if (onLoginFailureStopper) { onLoginFailureStopper.stop(); }
      validateLoginStopper = onLoginStopper = onLoginFailureStopper = null;
    }
  };
  AccountsMultiple._stoppers.push(stopper);
  return stopper;
};

AccountsMultiple._unregisterAll = function() {
  _.each(AccountsMultiple._stoppers, function (stopper) {
    stopper.stop();
  });
  AccountsMultiple._stoppers = [];
};

function createValidateLoginAttemptHandler(validateSwitchCallback, noUserCB) {
  return function (attempt) {
    // Don't do anything if the login handler can't even provide a user object
    // or a method name.
    if (! attempt.user || ! attempt.methodName) {
      return attempt.allowed;
    }

    var attemptingUser = AttemptingUser.get(attempt);

    if (! attemptingUser) {
      if(!noUserCB(attempt)) return false;
      
      var attemptingUserId = Meteor.userId();

      // Don't do anything if there is no user currently logged in or they are
      // attempting to login as themselves.
      if (! attemptingUserId || attempt.user._id === attemptingUserId) {
        return attempt.allowed;
      }
      attemptingUser = Meteor.users.findOne(attemptingUserId);
    }

    // Don't do anything if the logged in user already has credentials on
    // the service
    if (attemptingUser.services && attemptingUser.services[attempt.type]) {
      return attempt.allowed;
    }

    // Save the attempting user associated with the current login
    // so that our onSwitch and onSwitchFailure callbacks
    // can access it.
    AttemptingUser.set(attempt, attemptingUser);
    // This is the case we care about. A logged in user is attempting to login
    // to a new service.
    return validateSwitchCallback(attemptingUser, attempt);
  };
}
