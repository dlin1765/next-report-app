# Next Report App
This repo is a Next.js React app that was a part of a technical challenge for a Junior DevOps role. It contains a CI/CD pipeline that was implemented using Github Actions and deployed to an AWS EC2 instance.

## Getting Started | Setup Instructions

To run the project locally run these commands to clone the repo, install neccessary dependencies, and run the project in your local development environment.
```bash 
git clone https://github.com/dlin1765/next-report-app.git

# in the project directory
npm install --legacy-peer-deps
npm run dev
```

# Pipeline configuration explanation

When designing the pipeline. I chose AWS since it was the service I had the most familiarity with. The workflows are configured to connect to my AWS account using OIDC, which means I don't have to put in my AWS access keys as secrets in the repo. There are two different workflows in the project one that triggers on a test branch, and another that triggers on the main branch. 

### deploy-test.yaml

When code is pushed to the test branch, it sets up the testing environment in the Github Actions runner and runs the tests. If the tests succeed, it is built and using OIDC, an EC2 Instance is created on my AWS account through AWS Cloudformation. 
```bash 
aws cloudformation create-stack --stack-name ec2-nextreport-ec2-stack --template-body file://ec2-template-file.yaml 
```
The stack creates a new EC2 instance based on an existing image that I built manually. The new EC2 instance will be named nextreport-cf-ec2, you can view the public IP address and other info by running this command using the AWS CLI. 
```bash 
aws ec2 describe-instances --output table --query 'Reservations[].Instances[].[Tags[?Key==`Name`] | [0].Value, State.Name, InstanceId, PublicIpAddress]'
```
The app will be deployed on the public IP Address on port 3000, so just navigate to \<public ip\>:3000 to view the changes!

### deploy-main.yaml

When code is either pushed or merged to main, this workflow is triggered and sends commands to an existing EC2 instance using AWS System Manager. 
```bash
aws ssm send-command --document-name "AWS-RunShellScript" --document-version "1" \
--targets '[{"Key":"InstanceIds","Values":[${{secrets.PROD_INSTANCE_ID}}]}]' --parameters \
 '{"commands":["sudo git config --global --add safe.directory /home/ubuntu/next-report-app","sudo git pull","sudo npm install --legacy-peer-deps", \
"sudo npm run build","sudo pm2 start npm --name next-report-app -- run start -- -p 3000"],"workingDirectory":["/home/ubuntu/next-report-app"], \
"executionTimeout":["3600"]}' --timeout-seconds 600 --max-concurrency "50" --max-errors "0" --output-s3-bucket-name "lobbylinkablebucket" --region us-east-2
```

It tells the instance to pull the code from the GitHub repo, install dependencies, and to build and deploy the app using pm2. After deployment, the app is visable at it's public domain on port 3000. 

# Deployment process overview

This workflow allows for rapid testing by automatically deploying code to an EC2 instance when you commit changes to test. When you're sure that the features built on the test branch work correctly, merging the changes to main automatically updates the production code and deploys it to a set EC2 instance. 

#### Stopping the test deployment
After you're done testing your commits to the test branch, it's important to delete the stack to avoid running a bunch of uneccesary EC2 instances. You can delete them from the AWS CLI by running this command
```bash
aws cloudformation delete-stack --stack-name ec2-nextreport-ec2-stack
```

#### Redeploying main
In order to prevent pm2 from keeping old builds in memory, you should reboot the main instance before triggering the workflow. To reboot the instance from the CLI you can run this command. 
```bash
aws ec2 stop-instances --instance-ids (id here)
```
This will stop pm2 temporarily and the workflow will automatically redeploy the site for you.

## Setting up pipeline for your own AWS account 
If you want to set up this pipeline to work with your own AWS account, use the same workflow files but replace all the secret variables like the AWS_ACC_ID
```bash
      - name: Configure AWS Credentials OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{secrets.AWS_ACC_ID}}:role/aws-next-report-access
          role-session-name: GitHub-Action-Role
          aws-region: us-east-2
```
You will also need to do some work in your AWS account in order for the workflow to work correctly

### Configuring OIDC in GitHub actions for AWS

The TLDR is you need add an identity provider for AWS, and then create an IAM role that GitHub actions will use to access your AWS account. The steps to do so can be found at this [link](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services). 

```bash
# replace everything past "role/" with the name of the role you configured 
role-to-assume: arn:aws:iam::${{secrets.AWS_ACC_ID}}:role/aws-next-report-access
```

### Creating the base image

Launch an EC2 instance with a security group that has port 3000, 80, and 22 open. Choose Ubuntu for the Image type and the other settings don't really matter, I'm using a t2.micro. 

The instance also needs an IAM role attached to it that permits AWS SSM to send commands to it. For specific steps click this [link](https://aws.amazon.com/getting-started/hands-on/remotely-run-commands-ec2-instance-systems-manager/) 

After creating the role, you need to replace the "IamInstanceProfile" with the name of the profile you created in ec2-template-file.yaml and replace the SecurityGroupId field with the ID of your security group.

```
      SecurityGroupIds: 
        - sg-0b01295eba0289dc5
      Tags:
        - Key: "Name"
          Value: "nextreport-cf-ec2"
      IamInstanceProfile : Webserver
```

Next connect to your instance and run these scripts in /home/ubuntu/ (or whatever the name of your user folder is)

```bash
# set up the EC2 
sudo apt-get update
sudo apt-get upgrade
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g npm@latest
sudo npm install pm2 -g
git clone (your repo link)
cd (into your repo)
npm install --legacy-peer-deps
```

You then need to install chromium and some other libraries in order to get Puppeteer to run correctly. These are installed in the /home/ubuntu/.cache directory, run these commands, and then move .cache into the root of your project folder. 

```bash
npm install chromium
sudo apt-get install ca-certificates fonts-liberation libappindicator3-1 libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
cp -r /home/ubuntu/.cache /home/ubuntu/next-report-app
```

Lastly, create an image from your newly created EC2 instance, and then replace the AMI image ID in ec2-template-file.yaml with your image ID. You should now be all set up and ready to go! I've also included a CloudFormation template file that should also do the same thing, but I have not tested it extensively and have run into issues with it.

![image](https://github.com/user-attachments/assets/6b30c12c-678f-4a16-84bb-608010d72d8b)

To make things more convenient install and configure the AWS CLI. To learn how to install the AWS CLI, click [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html).

# Limitations / issues 

Currently there's no way to reboot main automatically to delete the currently running pm2 server. Although I think this can be added by adding "sudo pm2 delete next-report-app" in deploy-main.yaml.

The test development EC2 instance takes a while to spin up and needing to delete the stack after you're done I think could be done automatically, I just ran out of time to figure it out.

There is minimal security implemented for the main EC2 instance, I was having a lot of trouble making my security groups have minimal access and have it work with Github Actions so at the moment the server is pretty exposed. With some more time I believe I could fix these issues by reducing the scope of my security groups, and adding an ALB and implementing a firewall.

# Challenges I faced

The biggest challenge I faced was getting Puppeteer to work in my deployments. I was getting errors about how Puppeteer couldn't find Chrome or was missing a library. The problem I think stems from a change that Puppeteer made. Puppeteer normally installs a version of Chromium that it can use when it is installed, but at some point they moved where Puppeteer downloads it's version of Chrome. 

The fix ended up being a combination of a lot of solutions that I found during my research. I needed to first change the directory where Puppeteer looks for Chrome, and then install Chrome and some extra libraries on my EC2 instance and move the .cache folder into the project root folder. 
