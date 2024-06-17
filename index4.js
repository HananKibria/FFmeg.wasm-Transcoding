"use strict";

let currentVideoTime = 0;
let saveCurrentTime = true;
var ffmpegCount = 4;
var chunkDurationSize = 2;
var useMultiThreadIfAvailable = true;
var useWorkerFSIfAvailable = true;
var ffmpegs = [];
var loadBtn = null;
var logDiv = null;
var videoEl = null;
var localFileInput = null;
const baseURLFFMPEG = 'ffmpeg-wasm/ffmpeg';
const baseURLCore = 'ffmpeg-wasm/core';
const baseURLCoreMT = 'ffmpeg-wasm/core-mt';
const workerBFSLoaderURL = 'worker.loader.js';
const baseURL = 'packages';

const toBlobURL = async (url, mimeType) => {
    const resp = await fetch(url);
    const body = await resp.blob();
    const blob = new Blob([body], { type: mimeType });
    return URL.createObjectURL(blob);
};

const load = async () => {
    loadBtn.setAttribute('disabled', true);
    var loadConfig = null;
    if (useMultiThreadIfAvailable && window.crossOriginIsolated) {
        console.log("threading........................................")
        loadConfig = {
        workerLoadURL: await toBlobURL(`${baseURL}/814.ffmpeg.js`,  'text/javascript'),
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),

    };
}
    else {
    loadConfig = 
    {
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerLoadURL: await toBlobURL(`${baseURL}/814.ffmpeg.js`,  'text/javascript'),

    };
    }
    var tasks = [];
    while (ffmpegs.length < ffmpegCount) {
        let ffmpeg = new FFmpegWASM.FFmpeg({log:true})
        ffmpegs.push(ffmpeg);
        tasks.push(ffmpeg.load(loadConfig));
    }
    try{
        await Promise.all(tasks);
    }
    catch(err){
        console.log(err);
    }
    console.log('ffmpeg cores loaded:', ffmpegCount);
    localFileInput.removeAttribute('disabled');
    window._ffmpeg0 = ffmpegs[0];
};

const getMetadata = (inputFile) => {
    let ffmpeg = ffmpegs[0];
    return new Promise((resolve) => {
        var log = '';
        var metadataLogger = ({ message }) => {
            log += message;
            if (message.indexOf('Aborted()') > -1) {
                ffmpeg.off('log', metadataLogger);
                resolve(log);
            }
        };
        ffmpeg.on('log', metadataLogger);
        ffmpeg.exec(["-i", inputFile]);
    });
};

const getDuration = async (inputFile) => {
    var metadata = await getMetadata(inputFile);
    var patt = /Duration:\s*([0-9]{2}):([0-9]{2}):([0-9]{2}.[0-9]{0,2})/gm
    var m = patt.exec(metadata);
    return !m ? 0 : (m[1] * 3600) + (m[2] * 60) + (m[3] * 1);
};

const transcodeLocalFileInputToMediaSource = async () => {
    let files = localFileInput.files;
    let file = files.length ? files[0] : null;
    if (!file) return;
    localFileInput.setAttribute('disabled', true);
    await transcodeFileToMediaSource(file);
    localFileInput.removeAttribute('disabled');
};
const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
  };
const transcodeFileToMediaSource = async (file) => {
    console.log('file', file);
    const inputDir = 'input';
    const inputFile = `${inputDir}/${file.name}`;
    console.log('inputFile', inputFile);
    const controller=new AbortController();
    const signal=controller.signal
    var index2=0;
    // attachVideoDebug(videoEl);
    // mount the input file in each ffmpeg instance
    // (custom ffmpeg build with WORKERFS enabled)
    var useWorkerFS = ffmpegs[0].mount && ffmpegs[0].unmount && useWorkerFSIfAvailable;
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        await ffmpeg.createDir(inputDir);
        if (useWorkerFS) {
            console.log("dsdjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj........................................")
            await ffmpeg.mount('WORKERFS', { files: [file] }, inputDir);
        } else {
            await ffmpeg.writeFile(inputFile, new Uint8Array(await file.arrayBuffer()))
        }
    }));
    var duration = await getDuration(inputFile);
    if (duration > 0) {
        let hasAudio= true
        var initialChunk=null;
        if (ffmpegs.length > 0) {
            const tempOutput = 'temp.mp4';
            await ffmpegs[0].exec([
                "-i", inputFile,
                "-t", "1",  // Extract 1 second of data for codec analysis
                "-c", "copy",
                "-f", "mp4",
                "-y", tempOutput  // Overwrite if exists
            ]);
            initialChunk = await ffmpegs[0].readFile(tempOutput);
            await ffmpegs[0].deleteFile(tempOutput);
        }

        // Use mux.js to determine the codecs
        if (initialChunk) {
            console.log(" Use mux.js to determine the codecs............................")
            const codecs = muxjs.mp4.probe.tracks(new Uint8Array(initialChunk))
                .map(t => t.codec)
                .join(",");
            if(codecs.includes(",")){
                var mimeCodec = `video/mp4; codecs="avc1.64001f,mp4a.40.2"`;
                console.log(mimeCodec)
            } else {
                mimeCodec =`video/mp4; codecs="avc1.42c028"`;
                console.log(mimeCodec)
                hasAudio=false
            }
        }
     //   const result = await ffmpegs[0].ffprobe(inputFile);
        const mediaSource = new MediaSource();
        var mediaSourceURL = '';
        var jobs = [];
        const getCompletedJob = (i) => {
            if (i >= jobs.length) return null;
            var job = jobs[i];
            if (job.state != 'done') {
                return new Promise((resolve) => {
                    job.oncomplete = () => resolve(job);
                })
            } else {
                return Promise.resolve(job);
            }
        };
        var sourceBuffer;
        mediaSource.addEventListener('sourceopen', async (e) => {
            console.log('sourceopen', mediaSource.readyState); // 
            if (mediaSource.readyState != 'open') {
                return;
            }
    
            URL.revokeObjectURL(mediaSourceURL);
            mediaSource.duration = duration;
            sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
            sourceBuffer.mode = 'segments';
            var ii = 0;
           // attachBufferDebug(sourceBuffer);
            sourceBuffer.addEventListener("updateend", async () => {
                console.log('updateend', mediaSource.readyState); // ended
                if (mediaSource.readyState != 'open' ) {
                    return;
                }
                if(flagSeek2){
                    ii=index2;
                }
                if(!flagSeek2){
                    var job = await getCompletedJob(ii++);
                }
                if (!job && !flagSeek2) {
                    mediaSource.endOfStream();
                } else  if (!sourceBuffer.updating && !flagSeek2)  {
                    sourceBuffer.timestampOffset=job.chunkStart;
                    sourceBuffer.appendBuffer(job.outputData);
                }
                flagSeek2=false;
            });
            var job = await getCompletedJob(ii++);
           job.outputData!=null && job.outputData && sourceBuffer.appendBuffer(job.outputData);
        }, { once: true });
        var index = 0;
        var durationLeft = duration;
        var chunkStart = 0;
        while (chunkStart < duration) {
            let chunkDuration = durationLeft > chunkDurationSize ? chunkDurationSize : durationLeft;
            jobs.push({
                id: index,
                chunkStart: chunkStart,
                chunkDuration: chunkDuration,
                state: 'queued',    // queued, running, done
                outputData: null,
                oncomplete: null,
                promiseReject:undefined
            });
            chunkStart += chunkDuration;
            index++;
        }
        var currentSeek=0;
        // let currentSeek=chunkStart;
        // let flagSeek=false;
       // let flagSeek=false;
        mediaSourceURL = URL.createObjectURL(mediaSource);
        videoEl.src = mediaSourceURL;
        var jobQueue = [];
        let totalPromise;
        var flagSeek=false;
        var flagSeek2=false;
        var flagSeek3=false;
        videoEl.addEventListener('seeking', async (e) => {
            if(sourceBuffer.buffered.start(0)<e.target.currentTime && sourceBuffer.buffered.end(sourceBuffer.buffered.length-1)>e.target.currentTime){
                return;
            }
            e.preventDefault();
            flagSeek=true;
            flagSeek2=true;
            flagSeek3=true;
            currentSeek=Math.trunc(e.target.currentTime);
            if(currentSeek<sourceBuffer.buffered.start(0)){
                jobQueue=[];
                jobs.map((job) => jobQueue.push(job));
            }
            console.log(x,".................")
            for(let i=0;i<x;i++){
                try{
                    jobs[i].promiseReject();
                }
                catch(err){
                    console.log(err);
                }
            }
            controller.abort();
            if(mediaSource.readyState==='open'){
                sourceBuffer.abort();
            }
         
            //videoEl.dispatchEvent(new Event('seeked'));
            let g=jobQueue[0];
                while(g.chunkStart<currentSeek){
                    g=jobQueue.shift();
                }
                console.log(jobQueue.length,"..............ddddddddddd");
                console.log(jobQueue[0])
                index2=jobQueue[0].id;
                x=jobQueue[0].id
                g=jobQueue[0]
                g.chunkDuration=g.chunkDuration + g.chunkStart-currentSeek
                g.chunkStart=currentSeek;
            sourceBuffer.remove(sourceBuffer.buffered.start(0),sourceBuffer.buffered.end(sourceBuffer.buffered.length-1))

        });


        var x=0;
        jobs.map((job) => jobQueue.push(job));

        while (x<jobs.length)  {
            if(x && x%3==0  && !flagSeek){
                await delay(6000);
            }
            if(flagSeek){
                flagSeek=false;
            }
            console.log(jobQueue[0]);
            let promiseRejects=[];
            let Promises=ffmpegs.map(async (ffmpeg) => {
                
                return new Promise(async(resolve,reject)=>{
                let job = null;
                promiseRejects.push(reject)
                const onprogress = (ev) => {
                    if (!job) return;
                    job.progress = ev.progress;
                    console.log(`Segment progress: ${job.id} ${job.progress}`);
                };
                const onlog = (ev) => {
                    if (!job) return;
                    logDiv.innerHTML = ev.message;
                    console.log(`Segment log: ${job.id}`, ev.message);
                };
                ffmpeg.on('progress', onprogress);
                ffmpeg.on('log', onlog);
                console.log(flagSeek+"-----------------sssaas--------------");
                job = jobQueue.shift();
                job.state = 'running';
                console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                //await new Promise((r) => setTimeout(r, 1000));
                let outputFile = `/output.${job.id}.mp4`;
                
                let temp_video= `input/temp_video_${job.id}.mp4`;
                let temp_audio= `input/temp_video_${job.id}.aac`
                
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                if(hasAudio){
                    console.log(" audio.............................")
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-ss', `${job.chunkStart}`,
                        '-i', inputFile,     
                        '-an',                
                        '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof', 
                        '-t', `${job.chunkDuration}`,
                        '-preset', 'ultrafast',
                        '-c:v', 'libx264',    
                        '-crf', '23',         
                        `temp_video_${job.id}.mp4`,     
                    ],undefined,{signal});
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-ss', `${job.chunkStart}`,
                        '-i', inputFile,    
                        '-map', '0:a', // Assuming '0:a' selects the first audio stream  
                        '-vn',                
                        '-t', `${job.chunkDuration}`,
                        '-c:a', 'aac',        
                        '-b:a', '192k',      
                        `temp_audio_${job.id}.aac`,    
                    ],undefined,{signal});
                    // if(flagSeek){
                    //     flagSeek=false;
                    //     reject();
                    // }
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-i', `temp_video_${job.id}.mp4`,  
                        '-i', `temp_audio_${job.id}.aac`,  
                        '-c:v', 'copy',          
                        '-c:a', 'aac',          
                        '-b:a', '192k',     
                        '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof',
                        outputFile,            
                    ],undefined,{signal});
                    // if(flagSeek){
                    //     reject();
                    // }
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                }
                else{
                console.log("without audio................................")
                await ffmpeg.exec([
                    '-nostats',                           // Suppresses the printing of encoding statistics to speed up processing.
                    '-loglevel', 'error',                 // Only log errors to reduce console clutter.
                    '-i', inputFile,       
                    '-map', '0:v',               // Specifies the input file.
                    '-an',                                // Disables audio processing, suitable for video-only handling.
                    '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof', // Optimize for streaming by moving metadata to the beginning.
                    '-ss', `${job.chunkStart}`,           // Start time offset for slicing, adjust according to job specifics.
                    '-t', `${job.chunkDuration}`,         // Duration of the slice to be processed.
                    '-preset', 'ultrafast',               // Encoder preset for faster processing.
                    '-c:v', 'libx264',                    // Video codec to use.
                    '-crf', '23',                         // CRF value, balancing quality and file size.
                    outputFile,           // Output file with dynamic naming based on job ID.
                ],undefined,{signal});
                }
                       
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                try {
                    job.outputData = await ffmpeg.readFile(outputFile);
                } catch {
                    console.log('Error reading output video');
                }
                job.state = 'done';
                console.log(`Segment done: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                if (job.oncomplete) job.oncomplete();
                try {
                    
                    // if(hasAudio){
                    //     console.log("skdsakdsak................................temp-video")
                    //     await ffmpeg.deleteFile(temp_video);
                    //     await ffmpeg.deleteFile(temp_audio);
                    // }
                    console.log("output file................................")
                    await ffmpeg.deleteFile(outputFile);

                    if(flagSeek3===true && job.chunkStart>=currentSeek){
                        sourceBuffer.dispatchEvent(new Event('updateend'))
                        flagSeek3=false;
                    }
                } catch {
                    console.log('Error deleting output video');
                }
                ffmpeg.off('progress', onprogress);
                ffmpeg.off('log', onlog);
                resolve("OK")
                }).catch((err)=>{
                    console.log(err);
                })
                
            });
            for(let i=0;i<promiseRejects.length;i++){
                jobs[x].promiseReject=promiseRejects[i];
                x=x+1;
            }
            await Promise.all(Promises);
        }  
    }
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        if (useWorkerFS){
            await ffmpeg.unmount(inputDir);
        }
        await ffmpeg.deleteDir(inputDir);
    }));
}

addEventListener("load", async (event) => {
    localFileInput = document.querySelector('#local-file');
    localFileInput.addEventListener('change', async () => await transcodeLocalFileInputToMediaSource());
    loadBtn = document.querySelector('#load-button');
    loadBtn.addEventListener('click', async () => await load());
    loadBtn.removeAttribute('disabled');
    logDiv = document.querySelector('#log-div');
    videoEl = document.querySelector('#video-result');
    console.log('window loaded');

});

// function logVideoEvent(e) {
//     var debugTable = document.getElementById("videoDebug");
//     if (!debugTable) {
//         debugTable = document.createElement("table");
//         debugTable.id = "videoDebug";
//         debugTable.innerHTML = '<tr><td>time</td><td>target</td><td>name</td><td>ct</td><td>ns</td><td>rs</td><td>dur</td><td>error</td><td>bc</td><td>last buffer</td></tr>';
//         document.body.appendChild(debugTable);
//     }
//     var tr = document.createElement("tr");
//     if (debugTable.children.length > 1) {
//         debugTable.insertBefore(tr, debugTable.children[1]);
//     } else {
//         debugTable.appendChild(tr);
//     }
//     var date = new Date();
//     tr.innerHTML = '<td>' + (date.getHours() + ":" + date.getMinutes() + ":<b>" + date.getSeconds() + "." + date.getMilliseconds()) + '</b></td><td>' + Object.getPrototypeOf(e.target).constructor.name + '</td><th>' + e.type + '</th><td>' + videoEl.currentTime + '</td><td>' + videoEl.networkState + '</td><td>' + videoEl.readyState + '</td><td>' + videoEl.duration + '</td><td>' + (videoEl.error ? videoEl.error.code : '-') + '</td><td>' + videoEl.buffered.length + '</td><td>' + (videoEl.buffered.length ? (videoEl.buffered.start(videoEl.buffered.length - 1) + " - " + videoEl.buffered.end(videoEl.buffered.length - 1)) : 0) + '</td>';
// }

// function attachVideoDebug(video) {
//     var events = ["loadstart", "progress", "suspend", "abort", "error", "emptied", "stalled", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "seeking", "seeked", "ended", "durationchange", "timeupdate", "play", "pause", "ratechange", "resize", "volumechange"];
//     for (var i=0; i<events.length; i++) {
//         video.addEventListener(events[i], logVideoEvent);
//     }
// }

// function attachBufferDebug(sourceBuffer) {
//     var events = ["updatestart", "update", "updateend", "error", "abort" ];
//     for (var i=0; i<events.length; i++) {
//         sourceBuffer.addEventListener(events[i], logVideoEvent);
//     }
// }