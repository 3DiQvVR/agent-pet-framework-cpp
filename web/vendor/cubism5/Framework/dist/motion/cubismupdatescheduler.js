import { ICubismUpdater, ICubismUpdaterChangeListener } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
export class CubismUpdateScheduler {
    _cubismUpdatableList;
    _needsSort;
    constructor(){
        this._cubismUpdatableList = [];
        this._needsSort = false;
    }
    release() {
        for (const updater of this._cubismUpdatableList){
            if (updater) {
                updater.removeChangeListener(this);
            }
        }
        this._cubismUpdatableList.length = 0;
    }
    addUpdatableList(updatable) {
        if (!updatable) {
            return;
        }
        if (this.hasUpdatable(updatable)) {
            return;
        }
        this._cubismUpdatableList.push(updatable);
        updatable.addChangeListener(this);
        this._needsSort = true;
    }
    removeUpdatableList(updatable) {
        if (!updatable) {
            return false;
        }
        const index = this._cubismUpdatableList.indexOf(updatable);
        if (index >= 0) {
            this._cubismUpdatableList.splice(index, 1);
            updatable.removeChangeListener(this);
            return true;
        }
        return false;
    }
    sortUpdatableList() {
        this._cubismUpdatableList.sort(ICubismUpdater.sortFunction);
        this._needsSort = false;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        if (this._needsSort) {
            this.sortUpdatableList();
        }
        for(let i = 0; i < this._cubismUpdatableList.length; ++i){
            const updater = this._cubismUpdatableList[i];
            if (updater) {
                updater.onLateUpdate(model, deltaTimeSeconds);
            }
        }
    }
    getUpdatableCount() {
        return this._cubismUpdatableList.length;
    }
    getUpdatable(index) {
        if (index < 0 || index >= this._cubismUpdatableList.length) {
            return null;
        }
        return this._cubismUpdatableList[index];
    }
    hasUpdatable(updatable) {
        return this._cubismUpdatableList.indexOf(updatable) >= 0;
    }
    clearUpdatableList() {
        for (const updater of this._cubismUpdatableList){
            if (updater) {
                updater.removeChangeListener(this);
            }
        }
        this._cubismUpdatableList.length = 0;
        this._needsSort = false;
    }
    onUpdaterChanged(updater) {
        this._needsSort = true;
    }
}
import * as $ from './cubismupdatescheduler.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismUpdateScheduler = $.CubismUpdateScheduler;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
