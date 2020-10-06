# Telegram bot to manage teams bills and store data in Google Sheets.

## Steps to run

### 1. Setup telegram bot
https://core.telegram.org/bots

### 2. Setup Google API
Folow this guide - https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication


### 3. Setup configs

In **config** folder setup files:

privateKey.json - Google Api access token file from step 2.

config.json:

**telegramToken** - Telegram token; 

**googleEmail** - Google Email bot; 

**billsGoogleSheetID** - Google Sheet id with bills;

**listGoogleSheetID** - Goolge Sheet with users

adminIDs.js - Array of admin telegram ID's


## Run script
```
node src/index.js
```
or
```
npm run start
```
