# What it is
> A NodeJs module for Electron, that handles app.asar updates.

## How it works (Read this first)
* EAU (Electron Asar Updater) was built upon _Electron Application Updater_ to handle the process of updating the app.asar file inside an Electron app ; **it simply replaces the app.asar file (at /resources/) with the new one called "update.asar"!**
* The check for "updates" must by triggered by the application. **EAU doesn't make any kind of periodic checks on its own**.
* EAU talks to an API (let's call it so) to tell it if there is a new update.
    * The API receives a request from EAU with the client's **current version of the application (must be specified inside the application package.json file)**.
    * The API then responds with the new update, ... or simply *false* to abort.
    * If there's an update available the API should respond with the *source* for this update **update.asar** file.
    * EAU then downloads the .asar file, deletes the old app.asar and renames the update.asar to app.asar.

## But why ? (use cases)
* If you think these are too complicated to implement:
https://www.npmjs.com/package/electron-updater
http://electron.atom.io/docs/v0.33.0/api/auto-updater/
* If you don't think it's reasonable to update the hole .app or .exe file (up to 100MB) when you're only changing one file (usually 40MB).

---

## Installation
```
    $ npm install --save electron-asar-updater
```
Now, inside the *main.js* file, call it like this:
```
    const Electron = require('electron');
    const Application = Electron.app;
    const EAU = require('electron-asar-updater');
    const updateURL = 'http:// ....'; // The API EAU will talk to

    Application.on('ready', function(){
        // Initiate the module
        EAU.init({
            'api': updateURL
        });
        // Check for updates on startup
        mainWindow.webContents.on('did-finish-load', function() {
          mainWindow.webContents.executeJavaScript("checkForUpdates();");
        });
    });
```

That's it. Now, you can use ```EAU.check()``` to trigger the update process; EAU will first check for updates, if there was a new update, EAU will ask the user if he wants to update, then download it and replace the old app.asar. Inside a window you can use it like this:

```
    <script>
        var remote = null, app = null, EAU = null;

        window.onload = function() {
          remote = require('remote'),
          app = remote.require('app'),
          EAU = remote.require('electron-asar-updater');
        }

        window.checkForUpdates = function () {
          EAU.check(function(error){
            if(error){
              if(error === 'no_update_available') { return false; }
              alert(error);
              return false;
            }

            var apply = confirm("New Update Available.\nWould you like to update?");
            if (apply == true) {

                EAU.download(function(error){
                  if(error){
                    alert(error);
                    return false;
                  }
                  alert('App updated successfully! Restart it please.');
                  app.quit();
                });

            } else {
                return false;
            }

          });
        }
    </script>
```

---

# API

### `Init( setup )`

* **setup** (object) The module setup
    * **api** (string) The URL EAU will call to check for updates.
    * **logFile** (string) [optional] The file to log the update process updates and errors to it, pass *FALSE* to omit logging . Defaults to "updater-log.txt".
    * **requestOptions** (object) [optional] The global options for the HTTP requests EAU will make to check for updates and download them. EAU uses the cool [restler](https://github.com/danwrong/restler) for these requests, and the `requestOptions` will be used for all the requests ([the full options list](https://github.com/danwrong/restler#options)). You can use this option to pass an `accessToken` or a `username` and `password` along with the request, or even send some extra data along with the request through the `data` property.

        ```
            EAU.init({
                'api': 'http:// ...',
                'requestOptions': {'accessToken': ..., 'data': {'group': 'friends'}}
            });    
        ```
    * **callback** (function) [optional] The callback that will be trigger at the end of the process, whether the update was a success or not. You can set the callback here, or you can pass it directly to `check( ... )`, I use the later option, to be able to `console.log()` the error in the DevTools.

    ```
        EAU.init({
            'callback': function(error){ ... }
        });
    ```

### `check( callback )`

Will check for an update, if an update was found, will download it and install it! As mentioned, this method must be triggered, EAU wont check for updates on its own.
* **callback** The update result callback. Check the installation section above for more details.

---

## The update server
And I mean this in the most simple way possible. This server/API will receive one request, which is the check for updates, and will send one response of :

* **New update:** `{"last": " [the new version] ", "source": " [the .asar file url] "}` **EAU wont make any version comparisons, it will simply download the `source` url and extract it**. So, you will need to handle this on your side, EAU sends (POST-type request) you the client's current version (as `current`), you can use this to send the correct update!
* **Any other value, to cancel the update**

My current *update server* (for the app I described above) is:
```
    var desktop_app_version = '1.0.0';
    var desktop_app_URL = 'http://.../update.asar'

    this.app.post('/update', function (req, res) {
      if(req.body.current != desktop_app_version){
        res.write(JSON.stringify( {"last": desktop_app_version, "source": desktop_app_URL} ).replace(/[\/]/g, '\\/') );
      }else{
        res.write(JSON.stringify( {"last": desktop_app_version} ).replace(/[\/]/g, '\\/') );
      }
      res.end();
    });
```

---

* Please contact me with any comments or open an issue.
* The development of this module will be continued.

---

The MIT License (MIT) -
Copyright (c) 2016 Whitesmith services@whitesmith.co
