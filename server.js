/*
Copyright 2014 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://aws.amazon.com/apache2.0/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

*/


//Required modules and libraries
var express = require('express');
var path = require('path');
var passport = require('passport');
var session = require('express-session');
var AmazonStrategy = require('passport-amazon').Strategy;
var util = require('util');
var AWS = require('aws-sdk');


//Declaration of all properties linked to the environment (beanstalk configuration)
var AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
var AWS_REGION = process.env.AWS_REGION;
var COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;
var IAM_ROLE_ARN = process.env.IAM_ROLE_ARN;
var COGNITO_DATASET_NAME = process.env.COGNITO_DATASET_NAME;
var COGNITO_KEY_NAME = process.env.COGNITO_KEY_NAME;
var CALLBACKURL = process.env.CALLBACKURL;
var AMAZON_CLIENT_ID = process.env.AMAZON_CLIENT_ID;
var AMAZON_CLIENT_SECRET = process.env.AMAZON_CLIENT_SECRET;

//Declaration of variables for the app
var cognitosync;
var THE_TITLE = "Amazon Cognito Sample App Node.js";


//Passport serialization
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

//Using the Amazon strategy to "Login with Amazon"
passport.use(new AmazonStrategy({
    clientID: AMAZON_CLIENT_ID,
    clientSecret: AMAZON_CLIENT_SECRET,
    callbackURL: CALLBACKURL
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
        profile.token = accessToken;
        var user = profile;
        done(null, user);
    });
}));

//Initialize express
var app = express();

// setup of the app (view,assets,cookies,...)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({secret: 'foo',resave: true,saveUninitialized: true,cookie: {expires: false}}));


//Initialization of passport
app.use(passport.initialize());
app.use(passport.session());


//GET Home Page
app.get('/', function(req, res) {
  //Configure the SDK
  AWS.config.region = AWS_REGION;
  res.render('index', {
        title: THE_TITLE
    });
});

//GET Logout Page
app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
});



/* GET Amazon page for authentication. */
app.get('/auth/amazon',
    passport.authenticate('amazon', {
        scope: ['profile']
    }),
    function(req, res) {
        // The request will be redirected to Amazon for authentication, so this
        // function will not be called.
});


/* GET Amazon callback page. */
app.get('/auth/amazon/callback', passport.authenticate('amazon', {
        failureRedirect: '/'
    }),
    function(req, res) {
        res.redirect('/showData');
});


//GET ShowData page
//This page initialize the CognitoId and the Cognito client, then list the data contained in the Cognito dataset
app.get('/showData', ensureAuthenticated, function(req, res) {
    var params = {
        AccountId: AWS_ACCOUNT_ID, 
        RoleArn: IAM_ROLE_ARN, 
        IdentityPoolId: COGNITO_IDENTITY_POOL_ID, 
        Logins: {
            'www.amazon.com': req.user.token
        }
    };
    
    // initialize the Credentials object
    AWS.config.credentials = new AWS.CognitoIdentityCredentials(params);

    // Get the credentials for our user
    AWS.config.credentials.get(function(err) {
        if (err) console.log("## credentials.get: ".red + err, err.stack); // an error occurred
        else {
            req.user.COGNITO_IDENTITY_ID = AWS.config.credentials.identityId;

            // Other AWS SDKs will automatically use the Cognito Credentials provider
            // configured in the JavaScript SDK.
            cognitosync = new AWS.CognitoSync();
            cognitosync.listRecords({
                DatasetName: COGNITO_DATASET_NAME, // required
                IdentityId: req.user.COGNITO_IDENTITY_ID, // required
                IdentityPoolId: COGNITO_IDENTITY_POOL_ID // required
            }, function(err, data) {

                if (err) console.log("## listRecords: ".red + err, err.stack); // an error occurred
                else {
                    //Retrieve dataset metadata and SyncSessionToken for subsequent calls
                    req.user.COGNITO_SYNC_TOKEN = data.SyncSessionToken;
                    req.user.COGNITO_SYNC_COUNT = data.DatasetSyncCount;

                    //Check the existence of the key in the dataset
                    if (data.Count != "0") req.user.CURRENT_LIFE = data.Records[0].Value;
                    else req.user.CURRENT_LIFE = "0";

                    //Retrieve information on the dataset
                    var dataRecords = JSON.stringify(data.Records);

                    res.render('index', {
                        title: THE_TITLE,
                        gaugeValue: req.user.CURRENT_LIFE,
                        records: dataRecords,
                        amazonName: req.user.displayName,
                        amazonEmail: req.user.emails[0].value,
                        displayButtons: req.user,
                        cognitoId: req.user.COGNITO_IDENTITY_ID
                    });
                }
            });
        }
    });
});


// GET /modifyLife 
//This funtion will add or substract a certain amount of points of life in the gauge
//The amount is passed in the URL (positive or negative)
app.get('/modifyLife',ensureAuthenticated, function(req, res, next) {
    //Retrieve points from the URL parameter
    var points = parseInt(req.query.points);
    //Call to List Records in order to retrieve a new sync session token
    cognitosync.listRecords({
        DatasetName: COGNITO_DATASET_NAME, 
        IdentityId: req.user.COGNITO_IDENTITY_ID, 
        IdentityPoolId: COGNITO_IDENTITY_POOL_ID 
    }, function(err, data) {

        if (err) console.log("## listRecords: ".red + err, err.stack); // an error occurred
        else {
            //Retrieve dataset metadata and SyncSessionToken for subsequent calls
            req.user.COGNITO_SYNC_TOKEN = data.SyncSessionToken;
            req.user.COGNITO_SYNC_COUNT = data.DatasetSyncCount;

            //Compute current life, enforce a scale from 0 to 100 for the gauge
            req.user.CURRENT_LIFE = (parseInt(req.user.CURRENT_LIFE) + points).toString();
            if (parseInt(req.user.CURRENT_LIFE) < 0) req.user.CURRENT_LIFE="0";
            else if (parseInt(req.user.CURRENT_LIFE) > 100) req.user.CURRENT_LIFE="100";

            //Parameters for updating the dataset
            var params = {
                DatasetName: COGNITO_DATASET_NAME, 
                IdentityId: req.user.COGNITO_IDENTITY_ID, 
                IdentityPoolId: COGNITO_IDENTITY_POOL_ID, 
                SyncSessionToken: req.user.COGNITO_SYNC_TOKEN, 
                RecordPatches: [{
                    Key: COGNITO_KEY_NAME, 
                    Op: 'replace', 
                    SyncCount: req.user.COGNITO_SYNC_COUNT, 
                    Value: req.user.CURRENT_LIFE
                }]
            };

            //Make the call to Amazon Cognito
            cognitosync.updateRecords(params, function(err, data) {
                if (err) {
                    console.log("## updateRecords: ".red + err, err.stack);
                } // an error occurred
                else {
                    var dataRecords = JSON.stringify(data);
                    //render the page
                    res.render('index', {
                        title: THE_TITLE,
                        gaugeValue: req.user.CURRENT_LIFE,
                        records: dataRecords,
                        amazonName: req.user.displayName,
                        amazonEmail: req.user.emails[0].value,
                        displayButtons: req.user,
                        cognitoId: req.user.COGNITO_IDENTITY_ID
                    });
                }
            });

        }
    });
});



/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// Error handler, Stacktrace is displayed
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: err
    });
});


//Simple route middleware to ensure user is authenticated. Use this route middleware on any resource that needs to be protected.
//If the request is authenticated (via a persistent login session),
//the request will proceed.  Otherwise, the user will be redirected to the home page for login.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/')
}

//Set the port of the app
app.set('port', process.env.PORT || 8080);

//Launch the express server
var server = app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + server.address().port);
});