"use strict";





var ffmpegCount = 2;
var chunkDurationSize = 5;
var useMultiThreadIfAvailable = false;
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
const baseURL = './';

const toBlobURL = async (url, mimeType) => {
    const resp = await fetch(url);
    const body = await resp.blob();
    const blob = new Blob([body], { type: mimeType });
    return URL.createObjectURL(blob);
};

const load = async () => {
    loadBtn.setAttribute('disabled', true);
    const ffmpegBlobURL = `${baseURL}/ffmpeg.js`
    await import(ffmpegBlobURL);
    var loadConfig = null;
    if (useMultiThreadIfAvailable && window.crossOriginIsolated) {
        loadConfig = {
            workerLoadURL: `${baseURL}/814.ffmpeg.js`,
           wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            workerURL: `${baseURL}/ffmpeg-core.worker.js`,
            coreURL:`${baseURL}/ffmpeg-core.js`,
        }
    } else {
        loadConfig = {
            coreURL:`${baseURL}/ffmpeg-core.js`,
            wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            workerLoadURL: `${baseURL}/814.ffmpeg.js`
        };
    }
    var tasks = [];
    while (ffmpegs.length < ffmpegCount) {
        let ffmpeg = new FFmpegWASM.FFmpeg()
        ffmpegs.push(ffmpeg);
        tasks.push(ffmpeg.load(loadConfig));
    }
    await Promise.all(tasks);
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
    const inputDir = 'tests';
    const inputFile = `${inputDir}/${file.name}`;
    console.log('inputFile', inputFile);
    // mount the input file in each ffmpeg instance
    // (custom ffmpeg build with WORKERFS enabled)
    var useWorkerFS = ffmpegs[0].mount && ffmpegs[0].unmount && useWorkerFSIfAvailable;
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        await ffmpeg.createDir(inputDir);
        if (useWorkerFS) {
            await ffmpeg.mount('WORKERFS', { files: [file] }, inputDir);
        } else {
            await ffmpeg.writeFile(inputFile, new Uint8Array(await file.arrayBuffer()))
        }
    }));
    var duration = await getDuration(inputFile);
    if (duration > 0) {
        const mimeCodec = 'video/mp4; codecs="avc1.64001f"';
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
                if (!job) {
                    mediaSource.endOfStream();
                } else {
                    sourceBuffer.appendBuffer(job.outputData);
                }
            });
            var job = await getCompletedJob(ii++);
            sourceBuffer.appendBuffer(job.outputData);
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
        mediaSourceURL = URL.createObjectURL(mediaSource);
        videoEl.src = mediaSourceURL;
        var jobQueue = [];
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
            while (jobQueue.length) {
                job = jobQueue.shift();
                job.state = 'running';
                console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                //await new Promise((r) => setTimeout(r, 1000));
                const outputFile = `/output.${job.id}.mp4`;
                await ffmpeg.exec([
                    "-nostats",
                    "-loglevel", "error",
                    "-i", inputFile,
                    //"-vf", "scale=iw/4:ih/4",
                    "-an",
                    //"-movflags", "frag_keyframe+empty_moov+default_base_moof",
                    "-movflags", "faststart+frag_every_frame+empty_moov+default_base_moof",
                    "-ss", `${job.chunkStart}`,
                    "-t", `${job.chunkDuration}`,
                    "-preset", "ultrafast",
                    outputFile,
                ]);
                try {
                    job.outputData = await ffmpeg.readFile(outputFile);
                } catch {
                    console.log('Error reading output video');
                }
                job.state = 'done';
                console.log(`Segment done: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                if (job.oncomplete) job.oncomplete();
                try {
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
});