
    const Application = require('electron').app;
    const FileSystem = require('original-fs');
    const Utils = require('util');
    const HTTP = require('restler');
    
    // Yes, it's weird, but we need the trailing slash after the .asar
    // so we can read paths "inside" it, e.g. the package.json, where we look
    // for our current version
    const AppPath = Application.getAppPath() + '/';
    const AppPathFolder = AppPath.slice(0,AppPath.indexOf("app.asar"));
    const AppAsar = AppPath.slice(0,-1);
    const WindowsUpdater = AppPath.slice(0,AppPath.indexOf("resources")) + "updater.exe";
    
    const errors = [
        'version_not_specified',
        'cannot_connect_to_api',
        'no_update_available',
        'api_response_not_valid',
        'update_file_not_found',
        'failed_to_download_update',
        'failed_to_apply_update'
    ];

    /**
     * */
    var Updater = {
        /**
         * The setup
         * */
        'setup': {
            'api': null,
            'logFile': 'updater-log.txt',
            'requestOptions': {},
            'callback': false
        },

        /**
         * The new update information
         * */
        'update': {
            'last': null,
            'source': null,
            'file': null
        },

        /**
         * Init the module
         * */
        'init': function(setup){
            this.setup = Utils._extend(this.setup, setup);
            
            this.log("AppPath: " + AppPath);
            this.log("AppPathFolder: " + AppPathFolder);

        },

        /**
         * Logging
         * */
        'log': function(line){
            // Log it
            console.log('Updater: ', line);

            // Put it into a file
            if(this.setup.logFile){
              console.log("%s + %s + %s", AppPathFolder, this.setup.logFile, line);
                FileSystem.appendFileSync(AppPathFolder + this.setup.logFile, line + "\n");
            }
        },

        /**
         * Triggers the callback you set to receive the result of the update
         * */
        'end': function(error){
            if(typeof this.setup.callback != 'function') return false;
            this.setup.callback.call(this,
                ( error != 'undefined' ?errors[error] :false ),
                this.update.last);
        },

        /**
         * Make the check for the update
         * */
        'check': function(callback){
            if(callback){
                this.setup.callback = callback;
            }

            // Get the current version
            var packageInfo = require(AppPath + 'package.json');
            this.log(packageInfo.version);

            // If the version property not specified
            if(!packageInfo.version){
                this.log('The "version" property not specified inside the application package.json');
                this.end(0);

                return false;
            }

            var requestOptions = Utils._extend({}, this.setup.requestOptions);
            if(!requestOptions.data){
                requestOptions.data = {};
            }

            // Send the current version along with the request
            requestOptions.data.current = packageInfo.version;

            // Check for updates
            HTTP.post(this.setup.api, requestOptions)
                .on('complete', function(result){
                    // If the request failed
                    if(result instanceof Error){
                        Updater.log('Could not connect, ' + result.message);
                        Updater.end(1);
                        return false;
                    }

                    // Connected!
                    Updater.log('Connected to ' + Updater.setup.api);

                    // Handle the response
                    try{
                        if(!result){
                            throw false;
                        }

                        // Parse the response
                        var response = JSON.parse(result);

                        // If the "last" property is not defined
                        if(!response.last){
                            throw false;
                        }

                        // Update available
                        if(response.source){
                            Updater.log('Update available: ' + response.last);

                            // Store the response
                            Updater.update = response;

                            // Ask user for confirmation
                            Updater.end();

                        }else{
                            Updater.log('No updates available');
                            Updater.end(2);

                            return false;
                        }


                    }catch(error){
                        Updater.log(result + 'API response is not valid');
                        Updater.end(3);
                    }
                });
        },

        /**
         * Download the update file
         * */
        'download': function(callback){
            if(callback){
                this.setup.callback = callback;
            }

            var url = this.update.source,
                fileName = 'update.asar';

            this.log('Downloading ' + url);

            var requestOptions = Utils._extend({}, this.setup.requestOptions);
            requestOptions.decoding = 'buffer';

            // Download the file
            HTTP.get(url, requestOptions)
                .on('complete', function(data){
                    // The request failed
                    if(data instanceof Error){
                        Updater.log('Could not find the update file.');
                        Updater.end(4);
                        return false;
                    }

                    // The file full path
                    var updateFile = AppPathFolder + fileName;
                    Updater.log("updateFile: " + updateFile);

                    // Create the file
                    FileSystem.writeFile(updateFile, data, null, function(error){
                        if(error){
                            Updater.log(error + '\n Failed to download the update to a local file.');
                            Updater.end(5);
                            return false;
                        }

                        // Store the update file path
                        Updater.update.file = updateFile;
                        Updater.log("Updater.update.file: " + updateFile);

                        // Success
                        Updater.log('Update downloaded: ' + updateFile);

                        // Apply the update
                        Updater.apply();
                    });
                });
        },

        /**
         * Apply the update, remove app.asar and rename update.zip to app.asar
         * */
        'apply': function(){

            try{

                this.log("Going to unlink: " + AppPath.slice(0,-1));
                
                FileSystem.unlink(AppPath.slice(0,-1), function(err) {
                   if (err) {
                       Updater.log("Couldn't unlink: " + AppPath.slice(0,-1));
                       return console.error(err);
                   }
                   Updater.log("Asar deleted successfully.");
                });

            }catch(error){
                this.log('Delete error: ' + error);

                // Failure
                this.end(6);
            }

            try{
                this.log("Going to rename: " + this.update.file + " to: " + AppPath.slice(0,-1));
                FileSystem.rename(this.update.file,AppPath.slice(0,-1),function(err) {
                   if (err) {
                       Updater.log("Couldn't rename: " + Updater.update.file + " to: " + AppPath.slice(0,-1));
                       return console.error(err);
                   }
                   Updater.log("Update applied.");
                })

                this.log('End of update.');
                // Success
                this.end();

            }catch(error){
                this.log('Rename error: ' + error);

                // Failure
                this.end(6);
            }
        },
        
        // app.asar is always EBUSY on Windows, so we need to try another
        // way of replacing it. This should get called after the main Electron
        // process has quit. Win32 calls 'move' and other platforms call 'mv'
        'mvOrMove': function(child) {
          var updateAsar = AppPathFolder + 'update.asar';
          var appAsar = AppPathFolder + 'app.asar';
          var winArgs = "";
          
          Updater.log("Checking for " + updateAsar);
          
          try {
            FileSystem.accessSync(updateAsar)
            try {
              Updater.log("Going to shell out to move: " + updateAsar + " to: " + AppAsar);
              
              if (process.platform==='win32') {
                
                Updater.log("Going to start the windows updater:" + WindowsUpdater + " " + updateAsar + " " + appAsar);
                
                // JSON.stringify() calls mean we're correctly quoting paths with spaces
                winArgs = `${JSON.stringify(WindowsUpdater)} ${JSON.stringify(updateAsar)} ${JSON.stringify(appAsar)}`
                Updater.log(winArgs);
                // and the windowsVerbatimArguments options argument, in combination with the /s switch, stops windows stripping quotes from our commandline
                
                // This doesn't work:              
                // child.spawn(`${JSON.stringify(WindowsUpdater)}`,[`${JSON.stringify(updateAsar)}`,`${JSON.stringify(appAsar)}`], {detached: true, windowsVerbatimArguments: true, stdio: 'ignore'});
                // so we have to spawn a cmd shell, which then runs the updater, and leaves a visible window whilst running
                child.spawn('cmd', ['/s', '/c', '"' + winArgs + '"'], {detached: true, windowsVerbatimArguments: true, stdio: 'ignore'});
              } else {
                // here's how we'd do this on Mac/Linux, but on Mac at least, the .asar isn't marked as busy, so the update process above
                // is able to overwrite it.
                // 
                // child.spawn('bash', ['-c', ['cd ' + JSON.stringify(AppPathFolder), 'mv -f update.asar app.asar'].join(' && ')], {detached: true});
              }
              child.unref; // let the child live on
              
            } catch(error) {
              Updater.log("Shelling out to move failed: " + error);
            }
          } catch(error) {
            Updater.log("Couldn't see an " + updateAsar + " error was: " + error);
          }
        }
    };

    module.exports = Updater;
