export function updateSize(curArray, newSize, value = null, callPlacementNew = null) {
    const curSize = curArray.length;
    if (curSize < newSize) {
        if (callPlacementNew) {
            for(let i = curArray.length; i < newSize; i++){
                if (typeof value == 'function') {
                    curArray[i] = JSON.parse(JSON.stringify(new value()));
                } else {
                    curArray[i] = value;
                }
            }
        } else {
            for(let i = curArray.length; i < newSize; i++){
                curArray[i] = value;
            }
        }
    } else {
        curArray.length = newSize;
    }
}
