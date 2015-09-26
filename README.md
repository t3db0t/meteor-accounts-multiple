# brettle:accounts-multiple

[![Build Status](https://travis-ci.org/brettle/meteor-accounts-multiple.svg?branch=master)](https://travis-ci.org/brettle/meteor-accounts-multiple)

Supports handling the case where a logged in user attempts to login using a
different service.

This package is part of the `brettle:accounts-*` suite of packages. See
[`brettle:accounts-deluxe`](https://atmospherejs.com/brettle/accounts-deluxe)
for an overview of the suite and a live demo.

## Features

- Allows you to register a set of callbacks to run when a logged in user
  attempts to login using a different service.

- Works with any login service (accounts-password, acccounts-google, etc.)

- Works with `accounts-ui` and other similar packages.

## Installation
```sh
meteor add brettle:accounts-multiple
```

## Usage

```javascript
/* Register callbacks for handling when a logged in user
  attempts to login using a different service. */
AccountsMultiple.register({
  validateSwitch: validateSwitchCallback,  /* default: function () { return true; } */
  onSwitch: onSwitchCallback, /* default: function() {} */
  onSwitchFailure: onSwitchFailureCallback /* default: function () {} */
});

/* Works just like Accounts.validateLoginAttempt() except that the attempting
/* user is available. */
function validateSwitchCallback(attemptingUser, attempt) {
  if (/*attemptingUser may switch to attempt.user */) {
    return true;
  } else {
    throw new Meteor.Error('your-reason-code', 'Human readable reason');
    /* or return false; */
  }
}

/* Works just like Accounts.onLogin() callback except it's strictly called when
/* a logged in user logs in using a different service, and it provides the
/* original logged in user (attemptingUser). */
function onSwitchCallback(attemptingUser, attempt) {
  /* Maybe cleanup the original user, or merge the two users. */
}

/* Works just like Accounts.onLoginFailure() callback except it's strictly
/* called when a logged in user fails when logging in using a different service,
/* and it provides the attempting user. */
function onSwitchFailureCallback(attemptingUser, attempt) {
  if (attempt.error.error !== 'your-reason-code')
    return;
  /* Maybe merge the two users. */  
}
```
