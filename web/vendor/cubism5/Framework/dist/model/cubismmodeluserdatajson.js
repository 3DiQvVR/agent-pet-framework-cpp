import { CubismIdHandle } from '../id/cubismid.js';
import { CubismFramework } from '../live2dcubismframework.js';
import { CubismJson } from '../utils/cubismjson.js';
const Meta = 'Meta';
const UserDataCount = 'UserDataCount';
const TotalUserDataSize = 'TotalUserDataSize';
const UserData = 'UserData';
const Target = 'Target';
const Id = 'Id';
const Value = 'Value';
export class CubismModelUserDataJson {
    constructor(buffer, size){
        this._json = CubismJson.create(buffer, size);
    }
    release() {
        CubismJson.delete(this._json);
    }
    getUserDataCount() {
        return this._json.getRoot().getValueByString(Meta).getValueByString(UserDataCount).toInt();
    }
    getTotalUserDataSize() {
        return this._json.getRoot().getValueByString(Meta).getValueByString(TotalUserDataSize).toInt();
    }
    getUserDataTargetType(i) {
        return this._json.getRoot().getValueByString(UserData).getValueByIndex(i).getValueByString(Target).getRawString();
    }
    getUserDataId(i) {
        return CubismFramework.getIdManager().getId(this._json.getRoot().getValueByString(UserData).getValueByIndex(i).getValueByString(Id).getRawString());
    }
    getUserDataValue(i) {
        return this._json.getRoot().getValueByString(UserData).getValueByIndex(i).getValueByString(Value).getRawString();
    }
    _json;
}
import * as $ from './cubismmodeluserdatajson.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismModelUserDataJson = $.CubismModelUserDataJson;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
