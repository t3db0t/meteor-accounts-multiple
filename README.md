# accounts-multiple

Supports handling the case where a logged in user attempts to login using a
different service.

## Features

- Allows you to register a set of callbacks that are run when a logged in user
  attempts to login using a different service.

- Works with any login service (accounts-password, acccounts-google, etc.)

- Works with accounts-ui and other similar packages.

- Does not permanently monkey patch Meteor core.

## Installation
```sh
meteor add brettle:accounts-multiple
```

## Usage

```javascript
/* Register callbacks for handling when a logged in user
  attempts to login using a different service. */
AccountsMultiple.register({
  validateSwitch: validateSwitchCallback,  /* default: function() {return true;} */
  onSwitch: onSwitchCallback, /* default: function() {} */
  onSwitchFailure: onSwitchFailureCallback /* default: function() {} */
});

/* Works just like Accounts.validateLoginAttempt() except that the attempting
/* user is available. */
function validateSwitchCallback(attemptingUser, attempt) {
  if (/*attemptingUser is allowed to switch to attempt.user */) {
    return true;
  } else {
    throw new Meteor.Error('your-reason-code', 'Human readable reason');
    /* or return false; */
  }
}

/* Works just like Accounts.onLogin() callback except it is only called when a
/* logged in user successfully logs in using a different service, and it
/* provides the original logged in user (attemptingUser). */
function onSwitchCallback(attemptingUser, attempt) {
  /* Maybe cleanup the original user, or merge the two users. */
}

/* Works just like Accounts.onLoginFailure() callback except it is only called
/* when a logged in user fails when logging in using a different service, and it
/* provides the attempting user. */
function onSwitchFailureCallback(attemptingUser, attempt) {
  if (attempt.error.error !== 'your-reason-code')
    return;
  /* Maybe merge the two users. */  
}
```
