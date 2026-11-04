import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismIdHandle } from '../id/cubismid.js';
import { IParameterProvider } from './iparameterprovider.js';
export class CubismLipSyncUpdater extends ICubismUpdater {
    _lipSyncIds;
    _audioProvider;
    constructor(lipSyncIds, audioProvider, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_LipSync);
        this._lipSyncIds = [
            ...lipSyncIds
        ];
        this._audioProvider = audioProvider;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        if (this._audioProvider) {
            const updateSuccessful = this._audioProvider.update(deltaTimeSeconds);
            if (updateSuccessful) {
                const lipSyncValue = this._audioProvider.getParameter();
                for(let i = 0; i < this._lipSyncIds.length; i++){
                    model.addParameterValueById(this._lipSyncIds[i], lipSyncValue);
                }
            }
        }
    }
    setAudioProvider(audioProvider) {
        this._audioProvider = audioProvider;
    }
    getAudioProvider() {
        return this._audioProvider;
    }
}
import * as $ from './cubismlipsyncupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismLipSyncUpdater = $.CubismLipSyncUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
