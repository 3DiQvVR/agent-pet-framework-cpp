export class CubismId {
    static createIdInternal(id) {
        return new CubismId(id);
    }
    getString() {
        return this._id;
    }
    isEqual(c) {
        if (typeof c === 'string') {
            return this._id == c;
        } else if (c instanceof CubismId) {
            return this._id == c._id;
        }
        return false;
    }
    isNotEqual(c) {
        if (typeof c == 'string') {
            return !(this._id == c);
        } else if (c instanceof CubismId) {
            return !(this._id == c._id);
        }
        return false;
    }
    constructor(id){
        this._id = id;
    }
    _id;
}
import * as $ from './cubismid.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismId = $.CubismId;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
