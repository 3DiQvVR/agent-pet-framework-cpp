import { LAppGlManager } from './lappglmanager.js';
export class LAppTextureManager {
    constructor(){
        this._textures = new Array();
    }
    release() {
        for(let i = 0; i < this._textures.length; i++){
            this._glManager.getGl().deleteTexture(this._textures[i].id);
        }
        this._textures = null;
    }
    createTextureFromPngFile(fileName, usePremultiply, callback) {
        for(let i = 0; i < this._textures.length; i++){
            if (this._textures[i].fileName == fileName && this._textures[i].usePremultply == usePremultiply) {
                this._textures[i].img = new Image();
                this._textures[i].img.addEventListener('load', ()=>callback(this._textures[i]), {
                    passive: true
                });
                this._textures[i].img.src = fileName;
                return;
            }
        }
        const img = new Image();
        img.addEventListener('load', ()=>{
            const tex = this._glManager.getGl().createTexture();
            this._glManager.getGl().bindTexture(this._glManager.getGl().TEXTURE_2D, tex);
            this._glManager.getGl().texParameteri(this._glManager.getGl().TEXTURE_2D, this._glManager.getGl().TEXTURE_MIN_FILTER, this._glManager.getGl().LINEAR_MIPMAP_LINEAR);
            this._glManager.getGl().texParameteri(this._glManager.getGl().TEXTURE_2D, this._glManager.getGl().TEXTURE_MAG_FILTER, this._glManager.getGl().LINEAR);
            if (usePremultiply) {
                this._glManager.getGl().pixelStorei(this._glManager.getGl().UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            }
            this._glManager.getGl().texImage2D(this._glManager.getGl().TEXTURE_2D, 0, this._glManager.getGl().RGBA, this._glManager.getGl().RGBA, this._glManager.getGl().UNSIGNED_BYTE, img);
            this._glManager.getGl().generateMipmap(this._glManager.getGl().TEXTURE_2D);
            this._glManager.getGl().bindTexture(this._glManager.getGl().TEXTURE_2D, null);
            const textureInfo = new TextureInfo();
            if (textureInfo != null) {
                textureInfo.fileName = fileName;
                textureInfo.width = img.width;
                textureInfo.height = img.height;
                textureInfo.id = tex;
                textureInfo.img = img;
                textureInfo.usePremultply = usePremultiply;
                if (this._textures != null) {
                    this._textures.push(textureInfo);
                }
            }
            callback(textureInfo);
        }, {
            passive: true
        });
        img.src = fileName;
    }
    releaseTextures() {
        for(let i = 0; i < this._textures.length; i++){
            this._glManager.getGl().deleteTexture(this._textures[i].id);
            this._textures[i] = null;
        }
        this._textures.length = 0;
    }
    releaseTextureByTexture(texture) {
        for(let i = 0; i < this._textures.length; i++){
            if (this._textures[i].id != texture) {
                continue;
            }
            this._glManager.getGl().deleteTexture(this._textures[i].id);
            this._textures[i] = null;
            this._textures.splice(i, 1);
            break;
        }
    }
    releaseTextureByFilePath(fileName) {
        for(let i = 0; i < this._textures.length; i++){
            if (this._textures[i].fileName == fileName) {
                this._glManager.getGl().deleteTexture(this._textures[i].id);
                this._textures[i] = null;
                this._textures.splice(i, 1);
                break;
            }
        }
    }
    setGlManager(glManager) {
        this._glManager = glManager;
    }
    _textures;
    _glManager;
}
export class TextureInfo {
    img;
    id = null;
    width = 0;
    height = 0;
    usePremultply;
    fileName;
}
