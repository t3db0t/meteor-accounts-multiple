var Fiber = Npm.require('fibers');

AccountsMultiple = {};

AccountsMultiple.register = function(cbs) {
  var validateLoginStopper, onLoginStopper, onLoginFailureStopper;
  // If any of the callbacks is provided, we need to register a
  // validateLoginAttempt handler to at least capture the attempting user.
  if (cbs.validateSwitch || cbs.onSwitch || cbs.onSwitchFailure) {
    // Use an empty validateSwitch callback if necessary
    var cb = cbs.validateSwitch || function () { return true; };
    // Workaround a meteor bug when adding the validateLoginAttempt handler
    WithoutBindingEnvironment(function() {
      validateLoginStopper =
        Accounts.validateLoginAttempt(createValidateLoginAttemptHandler(cb));
    });
  }
  if (cbs.onSwitch) {
    onLoginStopper = Accounts.onLogin(function(attempt) {
      var attemptingUser = Fiber.current.accountsMultipleAttemptingUser;
      if (attemptingUser) {
        return cbs.onSwitch(attemptingUser, attempt);
      }
    });
  }
  if (cbs.onSwitchFailure) {
    onLoginFailureStopper = Accounts.onLoginFailure(function(attempt) {
      var attemptingUser = Fiber.current.accountsMultipleAttemptingUser;
      if (attemptingUser) {
        return cbs.onSwitchFailure(attemptingUser, attempt);
      }
    });
  }
  return {
    stop: function() {
      validateLoginStopper && validateLoginStopper.stop();
      onLoginStopper && onLoginStopper.stop();
      onLoginFailureStopper && onLoginFailureStopper.stop();
      validateLoginStopper = onLoginStopper = onLoginFailureStopper = null;
    }
  }
};

function createValidateLoginAttemptHandler(validateSwitchCallback) {
  return function (attempt) {
    // Don't override invalid login attempt
    if (!attempt.allowed)
      return false;

    // Don't do anything if the login handler can't even provide a user object
    // or a method name.
    if (!attempt.user || !attempt.methodName)
      return true;

    var attemptingUserId = Meteor.user();

    // Don't do anything if there is no user currently logged in or they are
    // attempting to login as themselves.
    if (! attemptingUserId || attempt.user._id === attemptingUserId) {
      return true;
    }

    var attemptingUser = Meteor.users.findOne(attemptingUserId);

    // Don't do anything if the logged in user already has credentials on
    // the service
    if (attemptingUser.services && attemptingUser.services[attempt.type]) {
      return true;
    }

    // Save the attempting user associated with the current login to the
    // current fiber so that our onSwitch and onSwitchFailure callbacks
    // can access it.
    Fiber.current.accountsMultipleAttemptingUser = attemptingUser;
    // This is the case we care about. A logged in user is attempting to login
    // to a new service.
    return validateSwitchCallback(attemptingUser, attempt);
  };
}

/* Workaround for Meteor issue #4862:
   See https://github.com/meteor/meteor/issues/4862.
 */
function WithoutBindingEnvironment(func) {
  var saved = Meteor.bindEnvironment;
  try {
    Meteor.bindEnvironment = dontBindEnvironment;
    return func();
  } finally {
    Meteor.bindEnvironment = saved;
  }
  return;

  // Copied from Meteor.bindEnvironment and removed all the env stuff.
  function dontBindEnvironment(func, onException, _this) {
    if (!onException || typeof(onException) === 'string') {
      var description = onException || "callback of async function";
      onException = function (error) {
        Meteor._debug(
          "Exception in " + description + ":",
          error && error.stack || error
        );
      };
    }

    return function (/* arguments */) {
      var args = _.toArray(arguments);

      var runAndHandleExceptions = function () {
        try {
          var ret = func.apply(_this, args);
        } catch (e) {
          onException(e);
        }
        return ret;
      };

      return runAndHandleExceptions();
    };
  }
}
