import { ICubismModelSetting } from './icubismmodelsetting.js';
import { CubismIdHandle } from './id/cubismid.js';
import { CubismFramework } from './live2dcubismframework.js';
import { CubismJson, Value } from './utils/cubismjson.js';
export var FrequestNode = /*#__PURE__*/ function(FrequestNode) {
    FrequestNode[FrequestNode["FrequestNode_Groups"] = 0] = "FrequestNode_Groups";
    FrequestNode[FrequestNode["FrequestNode_Moc"] = 1] = "FrequestNode_Moc";
    FrequestNode[FrequestNode["FrequestNode_Motions"] = 2] = "FrequestNode_Motions";
    FrequestNode[FrequestNode["FrequestNode_Expressions"] = 3] = "FrequestNode_Expressions";
    FrequestNode[FrequestNode["FrequestNode_Textures"] = 4] = "FrequestNode_Textures";
    FrequestNode[FrequestNode["FrequestNode_Physics"] = 5] = "FrequestNode_Physics";
    FrequestNode[FrequestNode["FrequestNode_Pose"] = 6] = "FrequestNode_Pose";
    FrequestNode[FrequestNode["FrequestNode_HitAreas"] = 7] = "FrequestNode_HitAreas";
    return FrequestNode;
}({});
export class CubismModelSettingJson extends ICubismModelSetting {
    constructor(buffer, size){
        super();
        this._json = CubismJson.create(buffer, size);
        if (this.getJson()) {
            this._jsonValue = [
                this.getJson().getRoot().getValueByString(this.groups),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.moc),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.motions),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.expressions),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.textures),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.physics),
                this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.pose),
                this.getJson().getRoot().getValueByString(this.hitAreas)
            ];
        }
    }
    release() {
        CubismJson.delete(this._json);
        this._jsonValue = null;
    }
    getJson() {
        return this._json;
    }
    getModelFileName() {
        if (!this.isExistModelFile()) {
            return '';
        }
        return this._jsonValue[1].getRawString();
    }
    getTextureCount() {
        if (!this.isExistTextureFiles()) {
            return 0;
        }
        return this._jsonValue[4].getSize();
    }
    getTextureDirectory() {
        const texturePath = this._jsonValue[4].getValueByIndex(0).getRawString();
        const pathArray = texturePath.split('/');
        const arrayLength = pathArray.length - 1;
        let textureDirectoryStr = '';
        for(let i = 0; i < arrayLength; i++){
            textureDirectoryStr += pathArray[i];
            if (i < arrayLength - 1) {
                textureDirectoryStr += '/';
            }
        }
        return textureDirectoryStr;
    }
    getTextureFileName(index) {
        return this._jsonValue[4].getValueByIndex(index).getRawString();
    }
    getHitAreasCount() {
        if (!this.isExistHitAreas()) {
            return 0;
        }
        return this._jsonValue[7].getSize();
    }
    getHitAreaId(index) {
        return CubismFramework.getIdManager().getId(this._jsonValue[7].getValueByIndex(index).getValueByString(this.id).getRawString());
    }
    getHitAreaName(index) {
        return this._jsonValue[7].getValueByIndex(index).getValueByString(this.name).getRawString();
    }
    getPhysicsFileName() {
        if (!this.isExistPhysicsFile()) {
            return '';
        }
        return this._jsonValue[5].getRawString();
    }
    getPoseFileName() {
        if (!this.isExistPoseFile()) {
            return '';
        }
        return this._jsonValue[6].getRawString();
    }
    getExpressionCount() {
        if (!this.isExistExpressionFile()) {
            return 0;
        }
        return this._jsonValue[3].getSize();
    }
    getExpressionName(index) {
        return this._jsonValue[3].getValueByIndex(index).getValueByString(this.name).getRawString();
    }
    getExpressionFileName(index) {
        return this._jsonValue[3].getValueByIndex(index).getValueByString(this.filePath).getRawString();
    }
    getMotionGroupCount() {
        if (!this.isExistMotionGroups()) {
            return 0;
        }
        return this._jsonValue[2].getKeys().length;
    }
    getMotionGroupName(index) {
        if (!this.isExistMotionGroups()) {
            return null;
        }
        return this._jsonValue[2].getKeys()[index];
    }
    getMotionCount(groupName) {
        if (!this.isExistMotionGroupName(groupName)) {
            return 0;
        }
        return this._jsonValue[2].getValueByString(groupName).getSize();
    }
    getMotionFileName(groupName, index) {
        if (!this.isExistMotionGroupName(groupName)) {
            return '';
        }
        return this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.filePath).getRawString();
    }
    getMotionSoundFileName(groupName, index) {
        if (!this.isExistMotionSoundFile(groupName, index)) {
            return '';
        }
        return this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.soundPath).getRawString();
    }
    getMotionFadeInTimeValue(groupName, index) {
        if (!this.isExistMotionFadeIn(groupName, index)) {
            return -1.0;
        }
        return this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeInTime).toFloat();
    }
    getMotionFadeOutTimeValue(groupName, index) {
        if (!this.isExistMotionFadeOut(groupName, index)) {
            return -1.0;
        }
        return this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeOutTime).toFloat();
    }
    getUserDataFile() {
        if (!this.isExistUserDataFile()) {
            return '';
        }
        return this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.userData).getRawString();
    }
    getLayoutMap(outLayoutMap) {
        const map = this.getJson().getRoot().getValueByString(this.layout).getMap();
        if (map == null) {
            return false;
        }
        let ret = false;
        for (const element of map){
            outLayoutMap.set(element[0], element[1].toFloat());
            ret = true;
        }
        return ret;
    }
    getEyeBlinkParameterCount() {
        if (!this.isExistEyeBlinkParameters()) {
            return 0;
        }
        let num = 0;
        for(let i = 0; i < this._jsonValue[0].getSize(); i++){
            const refI = this._jsonValue[0].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                num = refI.getValueByString(this.ids).getVector().length;
                break;
            }
        }
        return num;
    }
    getEyeBlinkParameterId(index) {
        if (!this.isExistEyeBlinkParameters()) {
            return null;
        }
        for(let i = 0; i < this._jsonValue[0].getSize(); i++){
            const refI = this._jsonValue[0].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                return CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
            }
        }
        return null;
    }
    getLipSyncParameterCount() {
        if (!this.isExistLipSyncParameters()) {
            return 0;
        }
        let num = 0;
        for(let i = 0; i < this._jsonValue[0].getSize(); i++){
            const refI = this._jsonValue[0].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                num = refI.getValueByString(this.ids).getVector().length;
                break;
            }
        }
        return num;
    }
    getLipSyncParameterId(index) {
        if (!this.isExistLipSyncParameters()) {
            return null;
        }
        for(let i = 0; i < this._jsonValue[0].getSize(); i++){
            const refI = this._jsonValue[0].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                return CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
            }
        }
        return null;
    }
    isExistModelFile() {
        const node = this._jsonValue[1];
        return !node.isNull() && !node.isError();
    }
    isExistTextureFiles() {
        const node = this._jsonValue[4];
        return !node.isNull() && !node.isError();
    }
    isExistHitAreas() {
        const node = this._jsonValue[7];
        return !node.isNull() && !node.isError();
    }
    isExistPhysicsFile() {
        const node = this._jsonValue[5];
        return !node.isNull() && !node.isError();
    }
    isExistPoseFile() {
        const node = this._jsonValue[6];
        return !node.isNull() && !node.isError();
    }
    isExistExpressionFile() {
        const node = this._jsonValue[3];
        return !node.isNull() && !node.isError();
    }
    isExistMotionGroups() {
        const node = this._jsonValue[2];
        return !node.isNull() && !node.isError();
    }
    isExistMotionGroupName(groupName) {
        const node = this._jsonValue[2].getValueByString(groupName);
        return !node.isNull() && !node.isError();
    }
    isExistMotionSoundFile(groupName, index) {
        const node = this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.soundPath);
        return !node.isNull() && !node.isError();
    }
    isExistMotionFadeIn(groupName, index) {
        const node = this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeInTime);
        return !node.isNull() && !node.isError();
    }
    isExistMotionFadeOut(groupName, index) {
        const node = this._jsonValue[2].getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeOutTime);
        return !node.isNull() && !node.isError();
    }
    isExistUserDataFile() {
        const node = this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.userData);
        return !node.isNull() && !node.isError();
    }
    isExistEyeBlinkParameters() {
        if (this._jsonValue[0].isNull() || this._jsonValue[0].isError()) {
            return false;
        }
        for(let i = 0; i < this._jsonValue[0].getSize(); ++i){
            if (this._jsonValue[0].getValueByIndex(i).getValueByString(this.name).getRawString() == this.eyeBlink) {
                return true;
            }
        }
        return false;
    }
    isExistLipSyncParameters() {
        if (this._jsonValue[0].isNull() || this._jsonValue[0].isError()) {
            return false;
        }
        for(let i = 0; i < this._jsonValue[0].getSize(); ++i){
            if (this._jsonValue[0].getValueByIndex(i).getValueByString(this.name).getRawString() == this.lipSync) {
                return true;
            }
        }
        return false;
    }
    _json;
    _jsonValue;
    version = 'Version';
    fileReferences = 'FileReferences';
    groups = 'Groups';
    layout = 'Layout';
    hitAreas = 'HitAreas';
    moc = 'Moc';
    textures = 'Textures';
    physics = 'Physics';
    pose = 'Pose';
    expressions = 'Expressions';
    motions = 'Motions';
    userData = 'UserData';
    name = 'Name';
    filePath = 'File';
    id = 'Id';
    ids = 'Ids';
    target = 'Target';
    idle = 'Idle';
    tapBody = 'TapBody';
    pinchIn = 'PinchIn';
    pinchOut = 'PinchOut';
    shake = 'Shake';
    flickHead = 'FlickHead';
    parameter = 'Parameter';
    soundPath = 'Sound';
    fadeInTime = 'FadeInTime';
    fadeOutTime = 'FadeOutTime';
    centerX = 'CenterX';
    centerY = 'CenterY';
    x = 'X';
    y = 'Y';
    width = 'Width';
    height = 'Height';
    lipSync = 'LipSync';
    eyeBlink = 'EyeBlink';
    initParameter = 'init_param';
    initPartsVisible = 'init_parts_visible';
    val = 'val';
}
import * as $ from './cubismmodelsettingjson.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismModelSettingJson = $.CubismModelSettingJson;
    Live2DCubismFramework.FrequestNode = $.FrequestNode;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
