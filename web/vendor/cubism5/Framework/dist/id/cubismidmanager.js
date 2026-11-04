import { CubismId } from './cubismid.js';
export class CubismIdManager {
    constructor(){
        this._ids = new Array();
    }
    release() {
        for(let i = 0; i < this._ids.length; ++i){
            this._ids[i] = void 0;
        }
        this._ids = null;
    }
    registerIds(ids) {
        for(let i = 0; i < ids.length; i++){
            this.registerId(ids[i]);
        }
    }
    registerId(id) {
        let result = null;
        if ('string' == typeof id) {
            if ((result = this.findId(id)) != null) {
                return result;
            }
            result = CubismId.createIdInternal(id);
            this._ids.push(result);
        } else {
            return this.registerId(id);
        }
        return result;
    }
    getId(id) {
        return this.registerId(id);
    }
    isExist(id) {
        if ('string' == typeof id) {
            return this.findId(id) != null;
        }
        return this.isExist(id);
    }
    findId(id) {
        for(let i = 0; i < this._ids.length; ++i){
            if (this._ids[i].getString() == id) {
                return this._ids[i];
            }
        }
        return null;
    }
    _ids;
}
import * as $ from './cubismidmanager.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismIdManager = $.CubismIdManager;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
