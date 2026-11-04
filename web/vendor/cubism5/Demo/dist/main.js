import { LAppDelegate } from './lappdelegate.js';
import * as LAppDefine from './lappdefine.js';
window.addEventListener('load', ()=>{
    if (!LAppDelegate.getInstance().initialize()) {
        return;
    }
    LAppDelegate.getInstance().run();
}, {
    passive: true
});
window.addEventListener('beforeunload', ()=>LAppDelegate.releaseInstance(), {
    passive: true
});
