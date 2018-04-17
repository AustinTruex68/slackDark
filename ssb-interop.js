/**
 * The preload script needs to stay in regular ole JavaScript, because it is
 * the point of entry for electron-compile.
 */

const preloadStartTime = process.hrtime();
require('../stat-cache');

const { init } = require('electron-compile');
const { assignIn } = require('lodash');
const path = require('path');

const { isPrebuilt } = require('../utils/process-helpers');
const profiler = require('../utils/profiler.js');

if (profiler.shouldProfile()) profiler.startProfiling();

//tslint:disable-next-line:no-console
process.on('uncaughtException', (e) => console.error(e));

/**
 * Patch Node.js globals back in, refer to
 * https://electron.atom.io/docs/api/process/#event-loaded.
 */
const processRef = window.process;
process.once('loaded', () => {
  window.process = processRef;
});

/**
 * loadSettings are just the command-line arguments we're concerned with, in
 * this case developer vs production mode.
 */
const loadSettings = window.loadSettings = assignIn({},
  require('electron').remote.getGlobal('loadSettings'),
  { windowType: 'webapp' }
);

window.perfTimer = assignIn({}, require('electron').remote.getGlobal('perfTimer'));
window.perfTimer.PRELOAD_STARTED = preloadStartTime;

const resourcePath = path.join(__dirname, '..', '..');
const mainModule = require.resolve('../ssb/main.ts');
const isDevMode = loadSettings.devMode && isPrebuilt();

init(resourcePath, mainModule, !isDevMode);

// First make sure the wrapper app is loaded
document.addEventListener("DOMContentLoaded", function() {

   // Then get its webviews
   let webviews = document.querySelectorAll(".TeamView webview");

   // Fetch our CSS in parallel ahead of time
   const cssPath = 'https://cdn.rawgit.com/widget-/slack-black-theme/master/custom.css';
   let cssPromise = fetch(cssPath).then(response => response.text());

   let customCustomCSS = `
   :root {
      /* Modify these to change your theme colors: */
      --primary: #09F;
      --text: #CCC;
      --background: #080808;
      --background-elevated: #222;
   }
   .c-virtual_list__scroll_container { background-color: var(--background); }
   .p-message_pane .c-message_list:not(.c-virtual_list--scrollbar):before, .p-message_pane .c-message_list.c-virtual_list--scrollbar > .c-scrollbar__hider:before {
      background-color: var(--background); 
      border-bottom: solid 1px var(--text);
   }
   .c-message_list__day_divider__label__pill {
      background-color: var(--background); 
      color: var(--text);
      border: solid 1px var(--border-bright);
   }
   .c-message__body {
      color: var(--text);
   }
   .c-message__sender {
      color: var(--primary);
   }
   .c-message:hover:not(.c-message--highlight):not(.c-message--standalone):not(.c-message--pinned):not(.c-message--ephemeral):not(.c-message--custom_response):not(.c-message--starred):not(.c-message--sli_highlight), .c-message--hover:not(.c-message--highlight):not(.c-message--standalone):not(.c-message--pinned):not(.c-message--ephemeral):not(.c-message--custom_response):not(.c-message--starred):not(.c-message--sli_highlight), .c-message--focus:not(.c-message--highlight):not(.c-message--standalone):not(.c-message--pinned):not(.c-message--ephemeral):not(.c-message--custom_response):not(.c-message--starred):not(.c-message--sli_highlight) {
      background-color: var(--background-elevated); 
   }
   `

   // Insert a style tag into the wrapper view
   cssPromise.then(css => {
      let s = document.createElement('style');
      s.type = 'text/css';
      s.innerHTML = css + customCustomCSS;
      document.head.appendChild(s);
   });

   // Wait for each webview to load
   webviews.forEach(webview => {
      webview.addEventListener('ipc-message', message => {
         if (message.channel == 'didFinishLoading')
            // Finally add the CSS into the webview
            cssPromise.then(css => {
               let script = `
                     let s = document.createElement('style');
                     s.type = 'text/css';
                     s.id = 'slack-custom-css';
                     s.innerHTML = \`${css + customCustomCSS}\`;
                     document.head.appendChild(s);
                     `
               webview.executeJavaScript(script);
            })
      });
   });
});