import { CubismIdHandle } from '../id/cubismid.js';
import { CubismFramework } from '../live2dcubismframework.js';
import { CubismModelUserDataJson } from './cubismmodeluserdatajson.js';
const ArtMesh = 'ArtMesh';
export class CubismModelUserDataNode {
    targetType;
    targetId;
    value;
}
export class CubismModelUserData {
    static create(buffer, size) {
        const ret = new CubismModelUserData();
        ret.parseUserData(buffer, size);
        return ret;
    }
    static delete(modelUserData) {
        if (modelUserData != null) {
            modelUserData.release();
            modelUserData = null;
        }
    }
    getArtMeshUserDatas() {
        return this._artMeshUserDataNode;
    }
    parseUserData(buffer, size) {
        let json = new CubismModelUserDataJson(buffer, size);
        if (!json) {
            json.release();
            json = void 0;
            return;
        }
        const typeOfArtMesh = CubismFramework.getIdManager().getId(ArtMesh);
        const nodeCount = json.getUserDataCount();
        let dstIndex = this._userDataNodes.length;
        this._userDataNodes.length = nodeCount;
        for(let i = 0; i < nodeCount; i++){
            const addNode = new CubismModelUserDataNode();
            addNode.targetId = json.getUserDataId(i);
            addNode.targetType = CubismFramework.getIdManager().getId(json.getUserDataTargetType(i));
            addNode.value = json.getUserDataValue(i);
            this._userDataNodes[dstIndex++] = addNode;
            if (addNode.targetType == typeOfArtMesh) {
                this._artMeshUserDataNode.push(addNode);
            }
        }
        json.release();
        json = void 0;
    }
    constructor(){
        this._userDataNodes = new Array();
        this._artMeshUserDataNode = new Array();
    }
    release() {
        for(let i = 0; i < this._userDataNodes.length; ++i){
            this._userDataNodes[i] = null;
        }
        this._userDataNodes = null;
    }
    _userDataNodes;
    _artMeshUserDataNode;
}
import * as $ from './cubismmodeluserdata.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismModelUserData = $.CubismModelUserData;
    Live2DCubismFramework.CubismModelUserDataNode = $.CubismModelUserDataNode;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
