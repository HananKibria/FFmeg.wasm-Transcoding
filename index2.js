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
const baseURL = 'packages';

const toBlobURL = async (url, mimeType) => {
    const resp = await fetch(url);
    const body = await resp.blob();
    const blob = new Blob([body], { type: mimeType });
    return URL.createObjectURL(blob);
};

const load = async () => {
    loadBtn.setAttribute('disabled', true);
    // const ffmpegBlobURL = await toBlobURL(`${baseURL}/814.ffmpeg.js`, 'text/javascript');
    // await import(ffmpegBlobURL);
    var loadConfig = null;
    if (useMultiThreadIfAvailable && window.crossOriginIsolated) {
        loadConfig = {
            workerLoadURL: await toBlobURL(`${baseURL}/814.ffmpeg.js`,  'text/javascript'),
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        };
    } else {
        loadConfig = {
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerLoadURL: await toBlobURL(`${baseURL}/814.ffmpeg.js`,  'text/javascript')
        };
    }
    var tasks = [];
    while (ffmpegs.length < ffmpegCount) {
        let ffmpeg =  FFmpeg.createFFmpeg({ log: true });
        ffmpegs.push(ffmpeg);
        tasks.push(ffmpeg.load(loadConfig));
    }
    await Promise.all(tasks);
    console.log('ffmpeg cores loaded:', ffmpegCount);
    localFileInput.removeAttribute('disabled');
    window._ffmpeg0 = ffmpegs[0];
};

const getMetadata = async (inputFile) => {
    let ffmpeg = ffmpegs[0];
    return new Promise((resolve) => {
        var log = '';
        // var metadataLogger = ({ message }) => {
        //     log += message;
        //     if (message.indexOf('Aborted()') > -1) {
        //         ffmpeg.off('log', metadataLogger);
        //         resolve(log);
        //     }
        // };
       // ffmpeg.on('log', metadataLogger);
        ffmpeg.run("-i", inputFile,"outputtxt");
    });
};

const getDuration = async (inputFile) => {
    // var metadata = await getMetadata(inputFile);
    // var patt = /Duration:\s*([0-9]{2}):([0-9]{2}):([0-9]{2}.[0-9]{0,2})/gm;
    // var m = patt.exec(metadata);
    return 300
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
    const inputDir = '/tests';
    const inputFile = `${inputDir}/${file.name}`;
    console.log('inputFile', inputFile);
    //var useWorkerFS = ffmpegs[0].FS('mount') && ffmpegs[0].FS('mount') && useWorkerFSIfAvailable;
    let useWorkerFS=true;
    console.log("useWorker",useWorkerFS)
    try {
        await Promise.all(ffmpegs.map(async (ffmpeg) => {
            ffmpeg.FS('mkdir', inputDir);
            if (useWorkerFS) {
                console.log("sasasas");
                ffmpeg.FS('mount', 'WORKERFS', { files: [file] }, inputDir);
            } else {
                ffmpeg.FS('writeFile', inputFile, new Uint8Array(await file.arrayBuffer()));
            }
        }));
    } catch (error) {
        console.error('Error in FS operations:', error);
        return;
    }

    var duration = 3000
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
                });
            } else {
                return Promise.resolve(job);
            }
        };
        mediaSource.addEventListener('sourceopen', async (e) => {
            console.log('sourceopen', mediaSource.readyState);
            if (mediaSource.readyState != 'open') {
                return;
            }
            URL.revokeObjectURL(mediaSourceURL);
            mediaSource.duration = duration;
            var sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
            sourceBuffer.mode = 'sequence';
            var ii = 0;
            sourceBuffer.addEventListener("updateend", async () => {
                console.log('updateend', mediaSource.readyState);
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
                state: 'queued',
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
            while (jobQueue.length) {
                job = jobQueue.shift();
                job.state = 'running';
                console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                const outputFile = `/output.${job.id}.mp4`;
                await ffmpeg.run(
                    "-nostats",
                    "-loglevel", "error",
                    "-i", inputFile,
                    "-an",
                    "-movflags", "faststart+frag_every_frame+empty_moov+default_base_moof",
                    "-ss", `${job.chunkStart}`,
                    "-t", `${job.chunkDuration}`,
                    "-preset", "ultrafast",
                    outputFile,
                );
                try {
                    job.outputData = ffmpeg.FS('readFile', outputFile);
                } catch {
                    console.log('Error reading output video');
                }
                job.state = 'done';
                console.log(`Segment done: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                if (job.oncomplete) job.oncomplete();
                try {
                    await ffmpeg.FS('unlink', outputFile);
                } catch {
                    console.log('Error deleting output video');
                }
            }
        }));
    }
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        if (useWorkerFS) {
            await ffmpeg.FS('unmount', inputDir);
        }
        await ffmpeg.FS('rmdir', inputDir);
    }));
};


window.addEventListener("load", async (event) => {
    localFileInput = document.querySelector('#local-file');
    localFileInput.addEventListener('change', async () => await transcodeLocalFileInputToMediaSource());
    loadBtn = document.querySelector('#load-button');
    loadBtn.addEventListener('click', async () => await load());
    loadBtn.removeAttribute('disabled');
    logDiv = document.querySelector('#log-div');
    videoEl = document.querySelector('#video-result');
    console.log('window loaded');
});
