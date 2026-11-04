import { CubismFramework, Option } from '../../Framework/dist/live2dcubismframework.js';
import * as LAppDefine from './lappdefine.js';
import { LAppPal } from './lapppal.js';
import { LAppSubdelegate } from './lappsubdelegate.js';
import { CubismLogError } from '../../Framework/dist/utils/cubismdebug.js';
export let s_instance = null;
export class LAppDelegate {
    static getInstance() {
        if (s_instance == null) {
            s_instance = new LAppDelegate();
        }
        return s_instance;
    }
    static releaseInstance() {
        if (s_instance != null) {
            s_instance.release();
        }
        s_instance = null;
    }
    onPointerBegan(e) {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].onPointBegan(e.pageX, e.pageY);
        }
    }
    onPointerMoved(e) {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].onPointMoved(e.pageX, e.pageY);
        }
    }
    onPointerEnded(e) {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].onPointEnded(e.pageX, e.pageY);
        }
    }
    onPointerCancel(e) {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].onTouchCancel(e.pageX, e.pageY);
        }
    }
    onResize() {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].onResize();
        }
    }
    run() {
        const loop = ()=>{
            if (s_instance == null) {
                return;
            }
            LAppPal.updateTime();
            for(let i = 0; i < this._subdelegates.length; i++){
                this._subdelegates[i].update();
            }
            requestAnimationFrame(loop);
        };
        loop();
    }
    release() {
        this.releaseEventListener();
        this.releaseSubdelegates();
        CubismFramework.dispose();
        this._cubismOption = null;
    }
    releaseEventListener() {
        document.removeEventListener('pointerup', this.pointBeganEventListener);
        this.pointBeganEventListener = null;
        document.removeEventListener('pointermove', this.pointMovedEventListener);
        this.pointMovedEventListener = null;
        document.removeEventListener('pointerdown', this.pointEndedEventListener);
        this.pointEndedEventListener = null;
        document.removeEventListener('pointerdown', this.pointCancelEventListener);
        this.pointCancelEventListener = null;
    }
    releaseSubdelegates() {
        for(let i = 0; i < this._subdelegates.length; i++){
            this._subdelegates[i].release();
        }
        this._subdelegates.length = 0;
        this._subdelegates = null;
    }
    initialize() {
        this.initializeCubism();
        this.initializeSubdelegates();
        this.initializeEventListener();
        return true;
    }
    initializeEventListener() {
        this.pointBeganEventListener = this.onPointerBegan.bind(this);
        this.pointMovedEventListener = this.onPointerMoved.bind(this);
        this.pointEndedEventListener = this.onPointerEnded.bind(this);
        this.pointCancelEventListener = this.onPointerCancel.bind(this);
        document.addEventListener('pointerdown', this.pointBeganEventListener, {
            passive: true
        });
        document.addEventListener('pointermove', this.pointMovedEventListener, {
            passive: true
        });
        document.addEventListener('pointerup', this.pointEndedEventListener, {
            passive: true
        });
        document.addEventListener('pointercancel', this.pointCancelEventListener, {
            passive: true
        });
    }
    initializeCubism() {
        LAppPal.updateTime();
        this._cubismOption.logFunction = LAppPal.printMessage;
        this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
        CubismFramework.startUp(this._cubismOption);
        CubismFramework.initialize();
    }
    initializeSubdelegates() {
        let width = 100;
        let height = 100;
        if (LAppDefine.CanvasNum > 3) {
            const widthunit = Math.ceil(Math.sqrt(LAppDefine.CanvasNum));
            const heightUnit = Math.ceil(LAppDefine.CanvasNum / widthunit);
            width = 100.0 / widthunit;
            height = 100.0 / heightUnit;
        } else {
            width = 100.0 / LAppDefine.CanvasNum;
        }
        this._canvases.length = LAppDefine.CanvasNum;
        this._subdelegates.length = LAppDefine.CanvasNum;
        for(let i = 0; i < LAppDefine.CanvasNum; i++){
            const canvas = document.createElement('canvas');
            this._canvases[i] = canvas;
            canvas.style.width = `${width}vw`;
            canvas.style.height = `${height}vh`;
            document.body.appendChild(canvas);
        }
        for(let i = 0; i < this._canvases.length; i++){
            const subdelegate = new LAppSubdelegate();
            subdelegate.initialize(this._canvases[i]);
            this._subdelegates[i] = subdelegate;
        }
        for(let i = 0; i < LAppDefine.CanvasNum; i++){
            if (this._subdelegates[i].isContextLost()) {
                CubismLogError(`The context for Canvas at index ${i} was lost, possibly because the acquisition limit for WebGLRenderingContext was reached.`);
            }
        }
    }
    constructor(){
        this._cubismOption = new Option();
        this._subdelegates = new Array();
        this._canvases = new Array();
    }
    _cubismOption;
    _canvases;
    _subdelegates;
    pointBeganEventListener;
    pointMovedEventListener;
    pointEndedEventListener;
    pointCancelEventListener;
}
