"use strict";

let currentVideoTime = 0;
let saveCurrentTime = true;
var ffmpegCount = 5;
var chunkDurationSize = 4;
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

const transcodeFileToMediaSource = async (file) => {
    console.log('file', file);
    const inputDir = 'input';
    const inputFile = `${inputDir}/${file.name}`;
    console.log('inputFile', inputFile);
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
        mediaSource.addEventListener('sourceopen', async (e) => {
            console.log('sourceopen', mediaSource.readyState); // 
            if (mediaSource.readyState != 'open') {
                return;
            }
    
            URL.revokeObjectURL(mediaSourceURL);
            mediaSource.duration = duration;
            var sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
            sourceBuffer.mode = 'sequence';
            var ii = 0;
            sourceBuffer.addEventListener("updateend", async () => {
                console.log('updateend', mediaSource.readyState); // ended
                if (mediaSource.readyState != 'open') {
                    return;
                }
                var job = await getCompletedJob(ii++);
                if (!job && !flagSeek) {
                    mediaSource.endOfStream();
                } else  if (!sourceBuffer.updating)  {
                    sourceBuffer.appendBuffer(job.outputData);
                }
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
            });
            chunkStart += chunkDuration;
            index++;
        }
        // let currentSeek=chunkStart;
        // let flagSeek=false;
        let flagSeek=false;
        mediaSourceURL = URL.createObjectURL(mediaSource);
        videoEl.src = mediaSourceURL;
        var jobQueue = [];
        let totalPromise;
        videoEl.addEventListener('seeking', async (e) => {
            console.log("sassddddddddddddd........................................seeked")
            if(flagSeek===false){
            let endSegmentStart=jobs[jobs.length-1].chunkStart;
            let endSegmentEnd=jobs[jobs.length-1].chunkDuration;
            let currentSeek=e.target.currentTime;
            console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaa........................................seeked")
            jobs=[];
           chunkStart=currentSeek;
           jobQueue=[];
           var index = 0;
           var durationLeft = duration;
           while (chunkStart < duration) {
                let chunkDuration = durationLeft > chunkDurationSize ? chunkDurationSize : durationLeft;
                jobs.push({
                    id: index,
                    chunkStart: chunkStart,
                    chunkDuration: chunkDuration,
                    state: 'queued',    // queued, running, done
                    outputData: null,
                    oncomplete: null,
                });
                    chunkStart += chunkDuration;
                    index++;
                }
            }
            jobs.map((job) => jobQueue.push(job));
            await Promise.all(ffmpegs.map(async (ffmpeg) => {
                let job = null;
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
                while (jobQueue.length && !flagSeek)  {
                    job = jobQueue.shift();
                    job.state = 'running';
                    console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                    //await new Promise((r) => setTimeout(r, 1000));
                    let outputFile = `/output.${job.id}.mp4`;
                    
                    let temp_video= `input/temp_video_${job.id}.mp4`;
                    let temp_audio= `input/temp_video_${job.id}.aac`
                  
                    
                    if(hasAudio){
                        console.log(" audio.............................")
                        await ffmpeg.exec([
                            '-nostats',
                            '-loglevel', 'error',
                            '-i', inputFile,     
                            '-an',                
                            '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof',
                            '-ss', `${job.chunkStart}`,
                            '-t', `${job.chunkDuration}`,
                            '-preset', 'ultrafast',
                            '-c:v', 'libx264',    
                            '-crf', '23',         
                            `temp_video_${job.id}.mp4`,     
                        ]);
                        await ffmpeg.exec([
                            '-nostats',
                            '-loglevel', 'error',
                            '-i', inputFile,    
                            '-map', '0:a', // Assuming '0:a' selects the first audio stream  
                            '-vn',                
                            '-ss', `${job.chunkStart}`,
                            '-t', `${job.chunkDuration}`,
                            '-c:a', 'aac',        
                            '-b:a', '512k',      
                            `temp_audio_${job.id}.aac`,    
                        ]);
                        await ffmpeg.exec([
                            '-nostats',
                            '-loglevel', 'error',
                            '-i', `temp_video_${job.id}.mp4`,  
                            '-i', `temp_audio_${job.id}.aac`,  
                            '-c:v', 'copy',          
                            '-c:a', 'aac',          
                            '-b:a', '512k',     
                            '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof',
                            outputFile,            
                        ]);
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
                    ]);
                   }
                  
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
                    } catch {
                        console.log('Error deleting output video');
                    }
    
                }
                ffmpeg.off('progress', onprogress);
                ffmpeg.off('log', onlog);
            }));
        });
       
    
        jobs.map((job) => jobQueue.push(job));
        await Promise.all(ffmpegs.map(async (ffmpeg) => {
            let job = null;
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
            console.log(flagSeek+"-----------------outside--------------");

            while (jobQueue.length && !flagSeek) {
                job = jobQueue.shift();
                job.state = 'running';
                console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                //await new Promise((r) => setTimeout(r, 1000));
                let outputFile = `/output.${job.id}.mp4`;
                
                let temp_video= `input/temp_video_${job.id}.mp4`;
                let temp_audio= `input/temp_video_${job.id}.aac`
              
                
                if(hasAudio){
                    console.log(" audio.............................")
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-i', inputFile,     
                        '-an',                
                        '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof',
                        '-ss', `${job.chunkStart}`,
                        '-t', `${job.chunkDuration}`,
                        '-preset', 'ultrafast',
                        '-c:v', 'libx264',    
                        '-crf', '23',         
                        `temp_video_${job.id}.mp4`,     
                    ]);
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-i', inputFile,    
                        '-map', '0:a', // Assuming '0:a' selects the first audio stream  
                        '-vn',                
                        '-ss', `${job.chunkStart}`,
                        '-t', `${job.chunkDuration}`,
                        '-c:a', 'aac',        
                        '-b:a', '512k',      
                        `temp_audio_${job.id}.aac`,    
                    ]);
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-i', `temp_video_${job.id}.mp4`,  
                        '-i', `temp_audio_${job.id}.aac`,  
                        '-c:v', 'copy',          
                        '-c:a', 'aac',          
                        '-b:a', '512k',     
                        '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof',
                        outputFile,            
                    ]);
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
                ]);
               }
              
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
                } catch {
                    console.log('Error deleting output video');
                }

            }
            ffmpeg.off('progress', onprogress);
            ffmpeg.off('log', onlog);
        }));
    }
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        if (useWorkerFS){
            await ffmpeg.unmount(inputDir);
        }
        await ffmpeg.deleteDir(inputDir);
    }));
};

addEventListener("load", async (event) => {
    localFileInput = document.querySelector('#local-file');
    localFileInput.addEventListener('change', async () => await transcodeLocalFileInputToMediaSource());
    loadBtn = document.querySelector('#load-button');
    loadBtn.addEventListener('click', async () => await load());
    loadBtn.removeAttribute('disabled');
    logDiv = document.querySelector('#log-div');
    videoEl = document.querySelector('#video-result');
    console.log('window loaded');


videoEl.addEventListener('seeked', e => {
  
});

// videoEl.addEventListener('seeking', e => {
//   console.log('seeking................', e.target.currentTime);
//   saveCurrentTime = false;
// });

// videoEl.addEventListener('timeupdate', e => {
//   console.log('timeupdate....................', e.target.currentTime);
//   if(saveCurrentTime)
//     currentVideoTime = e.target.currentTime;
// });
});
