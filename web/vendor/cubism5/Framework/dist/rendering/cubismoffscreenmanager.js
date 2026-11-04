import { updateSize } from '../utils/cubismarrayutils.js';
import { CubismLogError } from '../utils/cubismdebug.js';
import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl.js';
class CubismRenderTargetContainer {
    constructor(colorBuffer = null, renderTexture = null, inUse = false){
        this.colorBuffer = colorBuffer;
        this.renderTexture = renderTexture;
        this.inUse = inUse;
    }
    clear() {
        this.colorBuffer = null;
        this.renderTexture = null;
        this.inUse = false;
    }
    getColorBuffer() {
        return this.colorBuffer;
    }
    getRenderTexture() {
        return this.renderTexture;
    }
    colorBuffer;
    renderTexture;
    inUse;
}
class CubismWebGLContextManager {
    constructor(gl){
        this.gl = gl;
        this.offscreenRenderTargetContainers = new Array();
        this.previousActiveRenderTextureMaxCount = 0;
        this.currentActiveRenderTextureCount = 0;
        this.hasResetThisFrame = false;
        this.width = 0;
        this.height = 0;
    }
    release() {
        if (this.offscreenRenderTargetContainers != null) {
            for(let index = 0; index < this.offscreenRenderTargetContainers.length; ++index){
                const container = this.offscreenRenderTargetContainers[index];
                this.gl.deleteTexture(container.colorBuffer);
                this.gl.deleteFramebuffer(container.renderTexture);
            }
            this.offscreenRenderTargetContainers.length = 0;
            this.offscreenRenderTargetContainers = null;
        }
    }
    gl;
    offscreenRenderTargetContainers;
    previousActiveRenderTextureMaxCount;
    currentActiveRenderTextureCount;
    hasResetThisFrame;
    width;
    height;
}
export class CubismWebGLOffscreenManager {
    constructor(){
        this._contextManagers = new Map();
    }
    release() {
        if (this._contextManagers != null) {
            for (const manager of this._contextManagers.values()){
                manager.release();
            }
            this._contextManagers.clear();
            this._contextManagers = null;
        }
        CubismWebGLOffscreenManager._instance = null;
    }
    static getInstance() {
        if (this._instance == null) {
            this._instance = new CubismWebGLOffscreenManager();
        }
        return this._instance;
    }
    getContextManager(gl) {
        if (!this._contextManagers.has(gl)) {
            this._contextManagers.set(gl, new CubismWebGLContextManager(gl));
        }
        return this._contextManagers.get(gl);
    }
    removeContext(gl) {
        if (this._contextManagers.has(gl)) {
            const manager = this._contextManagers.get(gl);
            manager.release();
            this._contextManagers.delete(gl);
        }
    }
    initialize(gl, width, height) {
        const contextManager = this.getContextManager(gl);
        if (contextManager.offscreenRenderTargetContainers != null) {
            for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
                const container = contextManager.offscreenRenderTargetContainers[index];
                contextManager.gl.deleteTexture(container.colorBuffer);
                contextManager.gl.deleteFramebuffer(container.renderTexture);
                container.clear();
            }
            contextManager.offscreenRenderTargetContainers.length = 0;
        } else {
            contextManager.offscreenRenderTargetContainers = new Array();
        }
        contextManager.width = width;
        contextManager.height = height;
        contextManager.previousActiveRenderTextureMaxCount = 0;
        contextManager.currentActiveRenderTextureCount = 0;
        contextManager.hasResetThisFrame = false;
    }
    beginFrameProcess(gl) {
        const contextManager = this.getContextManager(gl);
        if (contextManager.hasResetThisFrame) {
            return;
        }
        contextManager.previousActiveRenderTextureMaxCount = 0;
        contextManager.hasResetThisFrame = true;
    }
    endFrameProcess(gl) {
        const contextManager = this.getContextManager(gl);
        contextManager.hasResetThisFrame = false;
    }
    getContainerSize(gl) {
        const contextManager = this.getContextManager(gl);
        if (contextManager.offscreenRenderTargetContainers == null) {
            return 0;
        }
        return contextManager.offscreenRenderTargetContainers.length;
    }
    getOffscreenRenderTargetContainers(gl, width, height, previousFramebuffer) {
        const contextManager = this.getContextManager(gl);
        if (contextManager.width != width || contextManager.height != height || contextManager.offscreenRenderTargetContainers == null) {
            this.initialize(gl, width, height);
        }
        this.updateRenderTargetContainerCount(gl);
        const container = this.getUnusedOffscreenRenderTargetContainer(gl);
        if (container != null) {
            return container;
        }
        const offscreenRenderTextureContainer = this.createOffscreenRenderTargetContainer(gl, width, height, previousFramebuffer);
        return offscreenRenderTextureContainer;
    }
    getUsingRenderTextureState(gl, renderTexture) {
        const contextManager = this.getContextManager(gl);
        for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
            if (contextManager.offscreenRenderTargetContainers[index].renderTexture == renderTexture) {
                return contextManager.offscreenRenderTargetContainers[index].inUse;
            }
        }
        return true;
    }
    startUsingRenderTexture(gl, renderTexture) {
        const contextManager = this.getContextManager(gl);
        for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
            if (contextManager.offscreenRenderTargetContainers[index].renderTexture != renderTexture) {
                continue;
            }
            contextManager.offscreenRenderTargetContainers[index].inUse = true;
            this.updateRenderTargetContainerCount(gl);
            break;
        }
    }
    stopUsingRenderTexture(gl, renderTexture) {
        const contextManager = this.getContextManager(gl);
        for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
            if (contextManager.offscreenRenderTargetContainers[index].renderTexture != renderTexture) {
                continue;
            }
            contextManager.offscreenRenderTargetContainers[index].inUse = false;
            contextManager.currentActiveRenderTextureCount--;
            if (contextManager.currentActiveRenderTextureCount < 0) {
                contextManager.currentActiveRenderTextureCount = 0;
            }
            break;
        }
    }
    stopUsingAllRenderTextures(gl) {
        const contextManager = this.getContextManager(gl);
        for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
            contextManager.offscreenRenderTargetContainers[index].inUse = false;
        }
        contextManager.currentActiveRenderTextureCount = 0;
    }
    releaseStaleRenderTextures(gl) {
        const contextManager = this.getContextManager(gl);
        const listSize = contextManager.offscreenRenderTargetContainers.length;
        if (contextManager.hasResetThisFrame || listSize === 0) {
            return;
        }
        let findPos = 0;
        let resize = contextManager.previousActiveRenderTextureMaxCount;
        for(let i = listSize; contextManager.previousActiveRenderTextureMaxCount < i; --i){
            const index = i - 1;
            if (contextManager.offscreenRenderTargetContainers[index].inUse) {
                let isFind = false;
                for(; findPos < contextManager.previousActiveRenderTextureMaxCount; ++findPos){
                    if (!contextManager.offscreenRenderTargetContainers[findPos].inUse) {
                        const tempContainer = contextManager.offscreenRenderTargetContainers[findPos];
                        contextManager.offscreenRenderTargetContainers[findPos] = contextManager.offscreenRenderTargetContainers[index];
                        contextManager.offscreenRenderTargetContainers[findPos].inUse = true;
                        contextManager.offscreenRenderTargetContainers[index] = tempContainer;
                        contextManager.offscreenRenderTargetContainers[index].inUse = false;
                        isFind = true;
                        break;
                    }
                }
                if (!isFind) {
                    resize = i;
                    break;
                }
            }
            const container = contextManager.offscreenRenderTargetContainers[index];
            contextManager.gl.bindTexture(contextManager.gl.TEXTURE_2D, null);
            contextManager.gl.deleteTexture(container.colorBuffer);
            contextManager.gl.bindFramebuffer(contextManager.gl.FRAMEBUFFER, null);
            contextManager.gl.deleteFramebuffer(container.renderTexture);
            container.clear();
        }
        updateSize(contextManager.offscreenRenderTargetContainers, resize);
    }
    getPreviousActiveRenderTextureCount(gl) {
        const contextManager = this.getContextManager(gl);
        return contextManager.previousActiveRenderTextureMaxCount;
    }
    getCurrentActiveRenderTextureCount(gl) {
        const contextManager = this.getContextManager(gl);
        return contextManager.currentActiveRenderTextureCount;
    }
    updateRenderTargetContainerCount(gl) {
        const contextManager = this.getContextManager(gl);
        ++contextManager.currentActiveRenderTextureCount;
        contextManager.previousActiveRenderTextureMaxCount = contextManager.currentActiveRenderTextureCount > contextManager.previousActiveRenderTextureMaxCount ? contextManager.currentActiveRenderTextureCount : contextManager.previousActiveRenderTextureMaxCount;
    }
    getUnusedOffscreenRenderTargetContainer(gl) {
        const contextManager = this.getContextManager(gl);
        for(let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index){
            const container = contextManager.offscreenRenderTargetContainers[index];
            if (container.inUse == false) {
                container.inUse = true;
                return container;
            }
        }
        return null;
    }
    createOffscreenRenderTargetContainer(gl, width, height, previousFramebuffer) {
        const renderTarget = new CubismRenderTarget_WebGL();
        if (!renderTarget.createRenderTarget(gl, width, height, previousFramebuffer)) {
            CubismLogError('Failed to create offscreen render texture.');
            return null;
        }
        const offscreenRenderTextureContainer = new CubismRenderTargetContainer(renderTarget.getColorBuffer(), renderTarget.getRenderTexture(), true);
        const contextManager = this.getContextManager(gl);
        contextManager.offscreenRenderTargetContainers.push(offscreenRenderTextureContainer);
        return offscreenRenderTextureContainer;
    }
    static _instance;
    _contextManagers;
}
