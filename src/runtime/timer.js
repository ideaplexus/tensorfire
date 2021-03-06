export function now() {
    if (typeof performance === 'undefined') {
        return Date.now()
    } else {
        return performance.now();
    }
}

function getTimer(gl){
    if(gl.NO_PROFILE) return;
    if(typeof gl.TIMER_POOL === 'undefined'){
        var extTimer = gl.getExtension('ext_disjoint_timer_query');
        if(!extTimer || !extTimer.createQueryEXT){
            gl.NO_PROFILE = true;
            return;
        }
        gl.TIMER_POOL = createTimer(gl)
    }
    return gl.TIMER_POOL;
}

export function beginTimer(gl, info={}){
    var timer = getTimer(gl);
    if(timer){
        timer.begin(info)
    }
}

export function endTimer(gl, callback){
    var timer = getTimer(gl);
    if(timer){
        timer.end(callback)
    }else if(callback){
        console.warn("Browser does not support ext_disjoint_timer_query, triggering callback after fixed timeout.")
        setTimeout(callback, 100);
    }
}

function createTimer(gl){   
    var extTimer = gl.getExtension('ext_disjoint_timer_query');

    var queryPool = []
    function allocQuery () {
        return queryPool.pop() || extTimer.createQueryEXT()
    }
    function freeQuery (query) {
        queryPool.push(query)
    }

    var pendingQueries = []
    function beginQuery (info) {
        var query = allocQuery()
        extTimer.beginQueryEXT(extTimer.TIME_ELAPSED_EXT, query)
        pendingQueries.push([query, info])
    }

    function endQuery () {
        extTimer.endQueryEXT(extTimer.TIME_ELAPSED_EXT)
    }

    function callback(info, time){
        var fn = info.callback;
        info.gpuTime = time;
        delete info.callback;
        if(fn) fn(info);
    }

    function monitorPending(){
        for (var i = 0; i < pendingQueries.length; ++i) {
            var query = pendingQueries[i][0]
            if (extTimer.getQueryObjectEXT(query, extTimer.QUERY_RESULT_AVAILABLE_EXT)) {
                var queryTime = extTimer.getQueryObjectEXT(query, extTimer.QUERY_RESULT_EXT)
                callback(pendingQueries[i][1], queryTime / 1e6)
                freeQuery(query)
                pendingQueries.splice(i, 1)
                i--
            }
        }
    }


    var isPolling = false;
    function loop(){
        if(pendingQueries.length > 0){
            monitorPending()
            requestAnimationFrame(loop)
        }else{
            isPolling = false;
        }
    }

    var currentInfo = null;
    return {
        begin(info = {}){
            if(currentInfo) throw new Error('beginTimer was called before previous endTimer');
            currentInfo = info
            info.cpuStartTime = now();
            beginQuery(currentInfo)
        },

        end(fn){
            currentInfo.cpuTime = now() - currentInfo.cpuStartTime
            delete currentInfo.cpuStartTime;
            currentInfo.callback = fn;
            currentInfo = null;
            endQuery()

            if(isPolling === false){
                isPolling = true;
                requestAnimationFrame(loop)
            }
        }
    }
}