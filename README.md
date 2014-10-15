Amazon Cognito sample application for Node.js
=========
  
Please read the blog post associated with this Amazon Cognito sample application on the [AWS Mobile blog](http://mobile.awsblog.com/)

This readme.me file only contains technical details on how to set up the sample application.

SETUP
----
Here are all the steps that you need to follow to be up and running.

### Deploy the code on AWS Elastic Beanstalk

Log in to the [Elastic Beanstalk console](https://console.aws.amazon.com/elasticbeanstalk) and perform the following steps:


1.    Create a new application, choose an application name and a description

2.    Select "Launch a new environment running this application", for the environment tier select "Web Server", for the configuration select "Node.js", for the environment type select "LoadBalancing, autoscaling"

3.    On the next screen for the application version select "Upload your own". Clone the github repository, once you are at the root of the repository, package the source code as a .zip file. It is important that the .zip archive contains files like "server.js" at its root level, otherwise the deployment will fail.

4.    Choose an environment name, an evironment URL and a description

5.    Do not select "Create an RDS DB instance" as this sample application do not require a database.

6.    For the configuration details you can leave all default values. Do not hesitate to customize some of the values depending on your needs.

7.    You can add a tag if you wish to

8.    Launch the environment of your new application


### Register your application with your identity provider (Login with Amazon)

1.    If you are a new user, navigate to https://sellercentral.amazon.com and create a Seller Central account when prompted

2.    Navigate to http://login.amazon.com/app-console-login and click the Register new application button

3.    Give your application a name, description, and paste in your Elastic Beanstalk environment’s URL you copied previously, appending /privacy

4.    Click Save

5.    Expand Web Settings and click Edit

6.    In Allowed JavaScript Origins, paste your environment’s URL. In Allowed Return URLs, paste your environment’s URL, append '/auth/amazon/callback' and change the protocol from http:// to https://. The return URL should look similar to this
https://xxxxxxxxxxxxxxxxx.elasticbeanstalk.com/auth/amazon/callback

7.    Copy and paste The App ID, Client ID and Client Secret. You’ll need them in later steps.


### Create a Cognito Identity Pool

Go to the [Cognito console](http://console.aws.amazon.com/cognito) and perform the following steps:

1.    Create a new identity pool

2.    Give it a name

3.    Under the "Public identity provider section" fill in the "Amazon App Id" field. To find the value for this field, go to the app console of your login.amazon.com account and look for "App ID"

4.    On the next screen "Create a new IAM role" and click "Update roles"

5.    You are done


### Create a self-signed certificate for your applications

If you already have a self-signed certificate or a signed certificate you can skip this step.

For those who does not you can execute the following steps.

Note: this steps assumes you are using Linux and have OpenSSL and the AWS CLI installed.

Login with Amazon.com has a different requirement from other Identity Providers, it requires the callback URL (the return address after a successful authentication) to be protected by SSL.  This means you need to generate and install a certificate on your application’s HTTPS end point.  In the case of an Elastic Beanstalk deployment with multiple hosts, this will be an Elastic Load Balancer.

For the purpose of this application, we will generate a self-signed certificate.  In a production scenario, you must of course use your own certificate, signed by a trusted third-party.

The following sequence of commands will generate the self-signed certificate with openssl and will upload it to IAM, where our load balancer will be able to pick it up.
```
## Generate a key pair
    $ openssl genrsa 2048 > ssl.pem

# Generate a signing request with your public key (change the subject !)
    $ openssl req -new -days 365 -nodes -out ssl.csr -key ssl.pem -subj "/C=US/L=Washington/O=Amazon Web Services/OU=Training/CN=*.elasticbeanstalk.com"

# Generate the certificate
    $ openssl x509 -req -days 365 -in ssl.csr -signkey ssl.pem -out ssl.crt

# Upload it to IAM (AWS CLI must be installed and configured)
    $ aws iam upload-server-certificate --certificate-body file://./ssl.crt --private-key file://./ssl.pem --server-certificate-name IdentityDemoCertificate

# You can test IAM to check your certificate
    $ aws iam get-server-certificate --server-certificate-name IdentityDemoCertificate
{ … } # ouput suppressed for brevety
```

### Modify the "Load balancers" configuration of your Beanstalk environment

Go into the AWS Elastic Beanstalk Console, go to "Configuration" and to "Load Balancing". You must [select a certificate](http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.managing.elb.html) for your ELB in the field "SSL Certificate ID".
Select the certificate you just uploaded.



### Modify the "Environment properties"
The last thing you will need to do is to modify the environment properties in Beanstalk.
Go to "Configuration", then "Software Configuration", and for the "environment properties" enter the following properties. You need to replace each value with the one from your environment. The table below contains three columns, the key of the environment property, the value of the environment property and comments on the environment property.

**The sample application need those environment properties to function properly, therefore if they are not set up the sample application will not start.**


| Key   | Value | Comments |
| ------------- | ------------- | ------------- |
| AMAZON_CLIENT_ID  | amzn1.application-oa2-client.xxxxxxxxx  | The Client ID from login.amazon.com |
| AMAZON_CLIENT_SECRET  | xxxxxxxxxxxx  | The Client Secret value from login.amazon.com |
| AWS_ACCOUNT_ID  | xxxxxxxxx  | Your AWS account ID |
| AWS_REGION  | us-east-1  | Region where the Amazon Cognito pool is |
| CALLBACKURL  | https://xxxxxxxxxxxx.elasticbeanstalk.com/auth/amazon/callback  | The callback URL customized with the name of your environment |
| COGNITO_DATASET_NAME  | GAME  | This is the name of the dataset, it is abitrary so you can change it |
| COGNITO_IDENTITY_POOL_ID  | us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx  | The unique ID of your Cognito identity pool |
| COGNITO_KEY_NAME  | LIFE  | This is the name of the key that will hold the value in your dataset, it is arbitrary so you can change it |
| IAM_ROLE_ARN  | arn:aws:iam::xxxxxxxxxx:role/Name_of_IAM_Role  | This is the IAM role that will be assigned to authenticated users |
