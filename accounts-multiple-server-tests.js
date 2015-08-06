// Causes an overlapping login to occur during the next login attempt.
function overlapNextLogin(expectedErrors) {
  expectedErrors = expectedErrors || [];
  var connection = DDP.connect(Meteor.absoluteUrl());
  var anonId, pwId;
  // Remove the users we use in case another test left them around
  Meteor.users.remove({'emails.address': 'overlap@example.com'});

  // Create an anonymous user
  anonId = connection.call('login', { anonymous: true }).id;

  // Add a one-off validateLoginAttempt handler that internally logs in as a
  // new non-anonymous user on the non-anonymous connection. The idea is that
  // the outer login does not complete until the inner login has. We want to
  // make sure that the inner login  doesn't end up using the attempting user
  // id captured during the the outer login.
  var validateLoginStopper = Accounts.validateLoginAttempt(function() {
    // Remove this handler so the next login attempt goes straight through
    validateLoginStopper.stop();

    try {
      // As a non-anonymous user, create and log in as another non-anonymous user.
      pwId = connection.call('createUser', { email: 'overlap@example.com', password: 'password' }).id;
    } catch (ex) {
      if (ex instanceof Meteor.Error && _.contains(expectedErrors, ex.error)) {
          //console.log('Ignoring expected error: ' + EJSON.stringify(ex));
      } else {
        throw ex;
      }
    }
    connection.disconnect();
    anonId && Meteor.users.remove(anonId);
    pwId && Meteor.users.remove(pwId);

    return true;
  });
}

// Returns a test function that wraps the original test function with common
// setup, try, and teardown in finally
function TestWithFixture(func) {
  return function(test) {
    var f = new MyTestFixture;
    f.debugCalls = 0;
    var origDebug = Meteor._debug;
    Meteor._debug = function(/*arguments*/) {
      f.debugCalls++
      origDebug.apply(this, arguments);
    };
    // Remove the users we use in case another test left them around
    Meteor.users.remove({'emails.address': 'testuser@example.com'});
    Meteor.users.remove({'emails.address': 'testuser2@example.com'});
    Meteor.users.remove({'emails.address': 'testuser3@example.com'});

    try {
      f.connection = DDP.connect(Meteor.absoluteUrl());
      f.id = f.connection.call('login', { anonymous: true }).id;
      test.equal(f.debugCalls, 0);
      f.attemptingUser = Meteor.users.findOne(f.id);
      // Call the test function
      func.apply(f, arguments);
    } finally {
      while (f.afterHandlers.length > 0) {
        var handler = f.afterHandlers.shift();
        try {
          handler();
        } catch (ex) {
          console.log('Ignoring exception thrown by after handler: ' + ex);
        }
      }
      f.connection && f.connection.disconnect();
      Meteor._debug = origDebug;
      f.id && Meteor.users.remove(f.id);
    }
  }
}

function MyTestFixture() {
  var f = this;
  f.afterHandlers = [];
  return f;
}

_.extend(MyTestFixture.prototype, {
  testSwitchingUsersWithOverlap: function(test, expectedErrors) {
    expectedErrors = expectedErrors || [];
    var f = this; // the fixture we are running in
    var id2;
    try {
      // Force another login to go all the way through while the next login is
      // still be validated.
      overlapNextLogin(expectedErrors);
      try {
        // Switch to a new user
        id2 = f.connection.call('createUser', { email: 'testuser2@example.com', password: 'password' }).id;
      } catch (ex) {
        if (ex instanceof Meteor.Error && _.contains(expectedErrors, ex.error)) {
            // console.log('Ignoring error: ' + EJSON.stringify(ex));
        } else {
          throw ex;
        }
      }
      test.equal(f.debugCalls, 0);
      f.attemptedUser = Meteor.users.findOne(id2);
    } finally {
      id2 && Meteor.users.remove(id2);
    }
  },

  checkArgs: function(test, spy, prefix, callNumber) {
    var f = this;
    callNumber = callNumber || 0;
    if (f.attemptingUser) {
      test.equal(spy.calls[callNumber].args[0]._id, f.attemptingUser._id, prefix + ': attemptingUser');
    }
    if (f.attemptedUser) {
      test.equal(spy.calls[callNumber].args[1].user._id, f.attemptedUser._id, prefix + ': attemptedUser');
    }
  },

  // Register a set of callbacks which count their calls, check their args and
  // call through
  registerSpiedCallbacks: function (test, callbacks) {
    callbacks.validateSwitch = callbacks.validateSwitch || function() { return true; };
    callbacks.onSwitch = callbacks.onSwitch || function() { };
    callbacks.onSwitchFailure = callbacks.onSwitchFailure || function() { };
    function spyOn(func) {
      var spyingFunc = function(/*arguments*/) {
        spyingFunc.calls.push({ thisArg: this, args: arguments });
        return func.apply(this, arguments);
      }
      spyingFunc.calls = [];
      return spyingFunc;
    }
    var f = this; // The fixture we are running in.
    f.validateSwitchSpy = spyOn(callbacks.validateSwitch);
    f.onSwitchSpy = spyOn(callbacks.onSwitch);
    f.onSwitchFailureSpy = spyOn(callbacks.onSwitchFailure);

    return AccountsMultiple.register({
      validateSwitch: f.validateSwitchSpy,
      onSwitch: f.onSwitchSpy,
      onSwitchFailure: f.onSwitchFailureSpy
    });
  },
  after: function(callback) {
    var f = this;
    f.afterHandlers.unshift(callback);
  }
});

Tinytest.add('AccountsMultiple - AccountsMultiple.register() never called', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  f.testSwitchingUsersWithOverlap(test);
}));

Tinytest.add('AccountsMultiple - AccountsMultiple.register({})', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  var stopper = AccountsMultiple.register({});
  f.after(function() { stopper.stop(); });
  f.testSwitchingUsersWithOverlap(test);
}));

Tinytest.add('AccountsMultiple - Remove registered callbacks', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  var stopper = f.registerSpiedCallbacks(test, { validateSwitch: function() { return true; } });
  f.testSwitchingUsersWithOverlap(test);
  test.equal(f.validateSwitchSpy.calls.length, 2, 'validateSwitch calls');
  f.checkArgs(test, f.validateSwitchSpy, 'validateSwitch args', 0);
  test.equal(f.onSwitchSpy.calls.length, 2, 'onSwitch calls');
  f.checkArgs(test, f.onSwitchSpy, 'validateSwitch args', 1);
  test.equal(f.onSwitchFailureSpy.calls.length, 0, 'onSwitchFailure calls');

  stopper.stop();
  f.testSwitchingUsersWithOverlap(test);
  test.equal(f.validateSwitchSpy.calls.length, 2, 'validateSwitch calls');
  test.equal(f.onSwitchSpy.calls.length, 2, 'onSwitch calls');
  test.equal(f.onSwitchFailureSpy.calls.length, 0, 'onSwitchFailure calls');
}));

Tinytest.add('AccountsMultiple - onSwitch called when validateSwitch returns true', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  var stopper = f.registerSpiedCallbacks(test, { validateSwitch: function() { return true; } });
  f.after(function() { stopper.stop(); } );
  f.testSwitchingUsersWithOverlap(test);
  test.equal(f.validateSwitchSpy.calls.length, 2, 'validateSwitch calls');
  f.checkArgs(test, f.validateSwitchSpy, 'validateSwitch args', 0);
  test.equal(f.onSwitchSpy.calls.length, 2, 'onSwitch calls');
  f.checkArgs(test, f.onSwitchSpy, 'onSwitch args', 1);
  test.equal(f.onSwitchFailureSpy.calls.length, 0, 'onSwitchFailure calls');
}));

Tinytest.add('AccountsMultiple - onSwitchFailed called when validateSwitch returns false', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  var stopper = f.registerSpiedCallbacks(test, { validateSwitch: function() { return false; } });
  f.after(function() { stopper.stop(); } );
  f.testSwitchingUsersWithOverlap(test, [403]);
  test.equal(f.validateSwitchSpy.calls.length, 2, 'validateSwitch calls');
  f.checkArgs(test, f.validateSwitchSpy, 'validateSwitch args', 0);
  test.equal(f.onSwitchSpy.calls.length, 0, 'onSwitch calls');
  test.equal(f.onSwitchFailureSpy.calls.length, 2, 'onSwitchFailure calls');
  f.checkArgs(test, f.onSwitchFailureSpy, 'onSwitchFailure args', 1);
}));

Tinytest.add('AccountsMultiple - onSwitchFailed called when validateSwitch throws', TestWithFixture(function (test) {
  var f = this; // the fixture we are running in
  var stopper = f.registerSpiedCallbacks(test, { validateSwitch: function() { throw new Meteor.Error('test-error', ''); } });
  f.after(function() { stopper.stop(); } );
  f.testSwitchingUsersWithOverlap(test, ['test-error']);
  test.equal(f.validateSwitchSpy.calls.length, 2, 'validateSwitch calls');
  f.checkArgs(test, f.validateSwitchSpy, 'validateSwitch args', 0);
  test.equal(f.onSwitchSpy.calls.length, 0, 'onSwitch calls');
  test.equal(f.onSwitchFailureSpy.calls.length, 2, 'onSwitchFailure calls');
  f.checkArgs(test, f.onSwitchFailureSpy, 'onSwitchFailure args', 1);
  var actualAttemptError = f.onSwitchFailureSpy.calls[1].args[1].error;
  test.isNotNull(actualAttemptError, 'onSwitchFailure error');
  test.equal(actualAttemptError.error, 'test-error', 'onSwitchFailure error string');
}));
