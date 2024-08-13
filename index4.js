"use strict";

let currentVideoTime = 0;
let saveCurrentTime = true;
var ffmpegCount = 2;
var chunkDurationSize = 1;
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
var db
let fileUrl=null;
let ext=null
var loadConfig = null;
let controller
let signal
var db2;
const toBlobURL = async (url, mimeType) => {
    const resp = await fetch(url);
    const body = await resp.blob();
    const blob = new Blob([body], { type: mimeType });
    return URL.createObjectURL(blob);
};
async function addObject(db, obj) {
    const tx = db.transaction('objects', 'readwrite')
    const store = tx.objectStore('objects')
    let data = await store.get(obj.id)
    if (!data) {
      await store.add(obj)
      await tx.done
      //consoel.log('Object added:', obj);
    }
  }
  async function getObject(db, id) {
    const tx = db.transaction('objects', 'readonly')
    const store = tx.objectStore('objects')
    const data = await store.get(id)
    //consoel.log('Object retrieved:', data);
    return data
  }
  async function updateObject(db, id, key, update) {
    const tx = db.transaction('objects', 'readwrite')
    const store = tx.objectStore('objects')

    try {
      let data = await store.get(id)
      // Update the data with new values
      data[key] = update
      data['state'] = 'completed'
      await store.put(data)
      await tx.done
      //consoel.log("Object updated successfully");
    } catch (error) {
      console.error('Error updating object: ', error)
    }
  }
  async function getFileSize(url) {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
        return parseInt(contentLength, 10);
    } else {
        throw new Error('Content-Length header is missing');
    }
}
function toFixed(num, fixed) {
    num = String(num)
    if (num.indexOf('.') !== -1) {
      var numarr = num.split('.')
      if (numarr.length == 1) {
        return Number(num)
      } else {
        return Number(
          numarr[0] + '.' + numarr[1].charAt(0) + numarr[1].charAt(1)
        )
      }
    } else {
      return Number(num)
    }
  }
function durationToSeconds(duration) {
    const [hours, minutes, seconds] = duration.split(':')
    return +hours * 3600 + +minutes * 60 + +seconds
  }
//   const extractKeyFrames = async (inputFile) => {
//     // Load the file
//  //   ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(inputFile));
//  return new Promise()
//     if (message.indexOf('Aborted()') > -1) {
//         ffmpeg.off('log', metadataLogger)
//         resolve(log)
//     }
    
//     }
//     ffmpeg.on('log', metadataLogger)
//     // Run the FFmpeg command
//      ffmpeg.exec([
//       '-i', inputFile,
//       '-vf', 'select=eq(pict_type\\,I)',
//       '-vsync', 'vfr',
//       '-frame_pts', 'true',
//       '-f', 'null',
//       '-'
//     ]);
  
//     // Retrieve the output
//     //const log = ffmpeg.FS('readFile', 'logfile.txt');
//     const logText = 
  
//     // Parse the key frames from the log
//     const keyFrames = parseKeyFrames(logText);
  
//     return keyFrames;
//   };
  
//   const parseKeyFrames = (logText) => {
//     const keyFrames = [];
//     const lines = logText.split('\n');
//     for (const line of lines) {
//       const match = line.match(/pts_time:(\d+(\.\d+)?)/);
//       if (match) {
//         keyFrames.push(parseFloat(match[1]));
//       }
//     }
//     return keyFrames;
//   };
const load = async () => {
    loadBtn.setAttribute('disabled', true);
    if (useMultiThreadIfAvailable ) {
        console.log("threading........................................")
        loadConfig = {
        // workerLoadURL: await toBlobURL(`${baseURL}/814.ffmpeg.js`,  'text/javascript'),
        coreURL: await toBlobURL(`packages/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`packages/ffmpeg-core.wasm`, "application/wasm"),
        workerURL: await toBlobURL(`packages/ffmpeg-core.worker.js`, "text/javascript"),

    }
}
    else {
    // loadConfig = 
    // {
    //     coreURL: await toBlobURL(`${baseURL}/core_custom_32_1024/ffmpeg-core.js`, 'text/javascript'),
    //     wasmURL: await toBlobURL(`${baseURL}/core_custom_32_1024/ffmpeg-core.wasm`, 'application/wasm'),
    //     workerLoadURL: await toBlobURL(`${baseURL}}/814.ffmpeg.js`,  'text/javascript'),

    // };
    }
    var tasks = [];
    while (ffmpegs.length < ffmpegCount) {
        let ffmpeg = new FFmpegWASM.FFmpeg()
        ffmpegs.push(ffmpeg);
        tasks.push(ffmpeg.load(loadConfig));
    }
    try{
        await Promise.all(tasks);
        db = await idb.openDB('MyDatabase', 1, {
            upgrade(db) {
              // Create an object store if it doesn't exist
              if (!db.objectStoreNames.contains('objects')) {
                db.createObjectStore('objects', { keyPath: 'id' })
              }
            },
          })
          db2 = await idb.openDB('MyDatabase2', 1, {
            upgrade(db) {
              // Create an object store if it doesn't exist
              if (!db.objectStoreNames.contains('objects')) {
                db.createObjectStore('objects', { keyPath: 'id' })
              }
            },
          })
    }
    catch(err){
        console.log(err);
    }
    console.log('ffmpeg cores loaded:', ffmpegCount);
    localFileInput.removeAttribute('disabled');
    window._ffmpeg0 = ffmpegs[0];
};

const getMetadata = inputFile => {
    var ffmpeg = ffmpegs[0]
    return new Promise(resolve => {
      var log = ''
       var metadataLogger = ({ message }) => {
         log += message
    //     setTimeout(()=>{
    //       try{
    //         controller.abort()

    //       }
    //       catch(err){
    //         console.log(err)
    //       }
    //       controller = new AbortController()
    //       signal = controller.signal
    //       resolve(log)
    //     },2000)
         console.log(message)
        if (message.indexOf('Aborted()') > -1) {
          ffmpeg.off('log', metadataLogger)
          resolve(log)
        }
        
      }
      ffmpeg.on('log', metadataLogger)
      ffmpegs[0].exec(['-i', inputFile,'-threads','4', '-c','copy',
        '-vsync', 'cfr',
        '-frame_pts', 'true', '-f', 'null', '-'],undefined,{signal})
    })
  }
async function fetchFile(url, start, end) {
    const response = await fetch(url, {
        headers: {
            'Range': `bytes=${start}-${end}`
        }
    });
    return await response.arrayBuffer();
}
function extractFrameTimes(logString) {
    // Regular expression to match the frame time pattern "time=HH:MM:SS.SS"
    const timePattern = /time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/g;
    let match;
    const frameTimesInSeconds = [];

    // Loop through all matches and convert time to seconds
    while ((match = timePattern.exec(logString)) !== null) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseFloat(match[3]);
        
        // Convert hours and minutes to seconds and add to fractional seconds, then round it
        const totalSeconds = toFixed((hours * 3600 + minutes * 60 + seconds),2);
        
        frameTimesInSeconds.push(totalSeconds);
    }

    return frameTimesInSeconds;
}

const getDuration = async inputFile => {
    var metadata = await getMetadata(inputFile)
    var patt = /Duration:\s*([0-9]{2}):([0-9]{2}):([0-9]{2}.[0-9]{0,2})/gm
    var m = metadata.match(/Duration: (\d+:\d+:\d+\.\d+)/)
    console.log(metadata)
    const durationRegex = /Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/

    // Extract duration using regular expression
    const match =m!=null && m.length && m[0].match(durationRegex)
    const endTimeMatch = metadata.match(/time=(\d+:\d+:\d+\.\d+)/g)
    const endTimeStr = endTimeMatch
      ? endTimeMatch[endTimeMatch.length - 1].split('=')[1]
      : '00:00:00.00'
      const videoBitrateRegex = /Stream #0:0.*Video:.*?,.*?,.*?,.*?,.*?(\d+ kb\/s)/;
      const audioBitrateRegex = /Stream #0:1.*Audio:.*?,.*?,.*?,.*?,.*?(\d+ kb\/s)/;
      const bitrateRegex = /bitrate:\s(\d+)\s\w{2}\/s/i;
      const match2 = metadata.match(bitrateRegex);
      console.log(match2);
      let bitrate
      if (match2) {
           bitrate = parseInt(match[1], 10);
          console.log(`Bitrate: ${bitrate}`);
      } else {
          console.log('Bitrate not found.');
      }
      // Extract video bitrate
      const videoBitrateMatch = metadata.match(videoBitrateRegex);
      const videoBitrate = videoBitrateMatch ? parseInt(videoBitrateMatch[1], 10) : 0;
      console.log("video",videoBitrateMatch)

      // Extract audio bitrate
      const audioBitrateMatch = metadata.match(audioBitrateRegex);
      const audioBitrate = audioBitrateMatch ? parseInt(audioBitrateMatch[1], 10) : 0;
      const videoBitrateBytesPerSec = videoBitrate * 1000; // 1 kb/s = 125 bytes/s
      const audioBitrateBytesPerSec = audioBitrate * 1000; // 1 kb/s = 125 bytes/s
      let totalBytes=videoBitrateBytesPerSec+audioBitrateBytesPerSec;  
    // Convert end time to seconds
    console.log("audio",audioBitrateMatch)

    const endTimeParts = endTimeStr.split(':')
    const endTime =
      parseFloat(endTimeParts[0]) * 3600 +
      parseFloat(endTimeParts[1]) * 60 +
      parseFloat(endTimeParts[2])
      const frameTimes=extractFrameTimes(metadata)
    // Check if match is found and convert to seconds
    if (match && match[1]) {
      const duration = match[1]
      const durationInSeconds = durationToSeconds(duration)
      const regex = /frame=\s*(\d+)/g;

// Match the pattern and extract frame numbers
const frameNumbers = [...metadata.matchAll(regex)].map(match => parseInt(match[1]));
      //consoel.log('Duration in seconds:', durationInSeconds)
      return [toFixed(durationInSeconds, 2), endTime,totalBytes,bitrate,frameTimes,frameNumbers]
    } else {
      //consoel.log('Duration not found')
    }
  }

const transcodeLocalFileInputToMediaSource = async () => {
    let files = localFileInput.files;
    console.log(files)
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
    const inputFile = `file.${ext}`;
    console.log('inputFile', inputFile);
    controller=new AbortController();
    signal=controller.signal
    var index2=0;
    let name= "/input/"+file.name
    console.log(name)

     attachVideoDebug(videoEl);
    // mount the input file in each ffmpeg instance
    // (custom ffmpeg build with WORKERFS enabled)
    var useWorkerFS = ffmpegs[0].mount && ffmpegs[0].unmount && useWorkerFSIfAvailable;
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        await ffmpeg.createDir(inputDir);
        if (true) {
            const onlog = (ev) => {
                console.log( ev.message);
            };
            ffmpeg.on('log', onlog);
            console.log("dsdjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj........................................")
            await ffmpeg.mount('WORKERFS', { files: [file] }, inputDir);
            ffmpeg.off('log', onlog);

        } else {
            await ffmpeg.writeFile(inputFile, new Uint8Array(await file.arrayBuffer()))
        }
    }));
    // await ffmpeg.exec([ '-i',name ,'-f','ffmetadata' ,'metadata.txt'])

    
    let filesize=100000
    console.log(filesize)
    let result = new SharedArrayBuffer(filesize +100000)
     
    const typedArray = new Uint8Array(result)
    // for(let i=0;i<typedArray.length;i++){
    //     typedArray[i]=0
    // }
    // const fileBuffer = new Uint8Array(await fetchFile(fileUrl,0, 100000)); // Example range, modify as needed
    // console.log(fileBuffer)
    // await ffmpegs[0].writeFile(inputFile, new Uint8Array(await fetchFile(fileUrl,0, 100000)) );
    var [duration,durationChunk,bytes,bitrate,frameTimes,frameNumbers] = await getDuration(name);
  //  ffmpegs.shift()
    // let duration=1700
    // let durationChunk=1
   console.log("bitrate",bitrate)
    console.log(durationChunk);
    // await ffmpegs[0].writeFile(inputFile, new Uint8Array(await fetchFile(fileUrl,0, 200000)) );
    // var [duration2,durationChunk2,bytes2,bitrate2] = await getDuration(inputFile);

//    let block_size=Math.trunc(filesize/duration)
    let block_size=Math.trunc(filesize/duration *2);
    // let size=durationChunk2-durationChunk

    // await ffmpegs[0].writeFile(inputFile, new Uint8Array(await fetchFile(fileUrl,0, block_size+100000)) );
    // var [duration2,durationChunk2,bytes2,bitrate2] = await getDuration(inputFile);
    // let size=durationChunk2-durationChunk
    // block_size=block_size*2
    // console.log(block_size)
    // chunkDurationSize=1
    // size=size *2

    console.log(duration)
    if (duration > 0) {
        let hasAudio= true
        var initialChunk=null;
        // if (ffmpegs.length > 0) {
        //     const tempOutput = 'temp.mp4';
        //     await ffmpegs[0].exec([
        //         "-i", inputFile,
        //         "-t", "1",  // Extract 1 second of data for codec analysis
        //         "-c", "copy",
        //         "-f", "mp4",
        //         "-y", tempOutput  // Overwrite if exists
        //     ]);
        //     initialChunk = await ffmpegs[0].readFile(tempOutput);
        //     await ffmpegs[0].deleteFile(tempOutput);
        // }

        // Use mux.js to determine the codecs
        var mimeCodec = `video/mp4; codecs="avc1.64001f,mp4a.40.2"`;
        if (initialChunk!=null) {
            console.log(" Use mux.js to determine the codecs............................")
            const codecs = muxjs.mp4.probe.tracks(new Uint8Array(initialChunk))
                .map(t => t.codec)
                .join(",");
            if(codecs.includes(",")){
              
                console.log(mimeCodec)
            } else {
                mimeCodec = `video/mp4; codecs="avc1.64001f,mp4a.40.2"`;
              //  mimeCodec =`video/mp4; codecs="avc1.42c028"`;
                console.log(mimeCodec)
                hasAudio=false
            }
        }
     //   const result = await ffmpegs[0].ffprobe(inputFile);
        const mediaSource = new MediaSource();
        var mediaSourceURL = '';
        var jobs = [];
        const getCompletedJob = async i => {
            if (i >= jobs.length) return null
            var job = jobs[i]
            if (job.state != 'completed') {
              return new Promise(resolve => {
                job.oncomplete = async () => {
                   let returnJob=await getObject(db,job.id);
                    //console.log("ssddsd",returnJob);
                  return resolve(returnJob)
                }
              })
            } else {
                let returnJob=await getObject(db,job.id);
              return Promise.resolve(returnJob)
            }
          }
        var sourceBuffer;
        let isMouseDown=false;
        var ii = 0;
        var seekII=false;
        let seeking=false;
        let flagRemoval=false;
        let skip=0;
        let flagStart=false;
        let flagSeek8=false;
        let currentTime=0;
        var flagSeek4=false
        videoEl.addEventListener('play',(e)=>{
            // e.preventDefault();
             if(seeking){
                 currentSeek=Math.trunc(e.target.currentTime);
                currentTime=currentSeek
                 seeking=false;
                 videoEl.dispatchEvent(new Event('seeked'))
             }
         })
        mediaSource.addEventListener('sourceopen', async (e) => {
            console.log('sourceopen', mediaSource.readyState); // 
            if (mediaSource.readyState != 'open') {
                return;
            }

            URL.revokeObjectURL(mediaSourceURL);
            mediaSource.duration = duration
            sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
            sourceBuffer.mode = 'sequence';
            sourceBuffer.appendWindowStart=0;
            sourceBuffer.appendWindowEnd=duration;
            let flagSeek11=true;
         //   mediaSource.setLiveSeekableRange(0,duration);
            console.log("sourceopen]]]]]]]]]]]]]]]]]]]]]]]]")
            // setInterval(()=>{
            //     if(sourceBuffer.buffered.length>0){
            //         let diff= currentTime-currentSeek
            //         if(currentTime>4 && (sourceBuffer.buffered.end(0)-sourceBuffer.buffered.start(0))>6 && (currentTime-sourceBuffer.buffered.start(0))>4){
            //             if(!sourceBuffer.updating){
            //                 sourceBuffer.remove(sourceBuffer.buffered.start(0),currentTime-2)
            //             }
            //         }
            //     }
            // },1000)
           videoEl.addEventListener("timeupdate",(e)=>{
                currentTime=Math.trunc(e.target.currentTime)
           },)
            attachBufferDebug(sourceBuffer);
            sourceBuffer.addEventListener("updateend", async () => {
                console.log('updateend', mediaSource.readyState); // ended
                if (mediaSource.readyState != 'open' ) {
                    return;
                }
                if(flagStart===true){
                    skip=sourceBuffer.buffered.end(0);
                    flagStart=false;
                }
                 if(seekII===true && !sourceBuffer.updating){
                    ii=index2;
                //   sourceBuffer.timestampOffset=currentSeek;
                    seekII=false;

                 }
                //}
                if(!flagSeek4){
                    var job = await getCompletedJob(ii++);
                }
                if (!job && !flagSeek2  ) {
                    mediaSource.endOfStream();
                } else  if (!sourceBuffer.updating && job!=undefined && job!=null && (!flagSeek2 || job.id===index2 ) && job.outputData!=null )  {
                //     if(!flagSeek8 && !flagSeek11){
                //         videoEl.currentTime=job.chunkStart-1 +0.01
                    
                // //        sourceBuffer.remove(sourceBuffer.buffered.start(0),sourceBuffer.buffered.end(0)-1)
                //   //      flagRemoval=true;
                //     }
                   // if(flagSeek8){
                //    console.log(frameTimes)
                //    if(){
                //  console.log(job.frameTime)
              //   if(sourceBuffer.buffered.end(0)>ch){
                //     sourceBuffer.appendWindowStart=job.frameTime
                 //}
                 //sourceBuffer.timestampOffset=job.
                //    sourceBuffer.appendWindowStart=job.frameTime
                //     frameTimes.shift();
                    //}
                  // if(!flagSeek2){
                   if(job.id===index2){
                    sourceBuffer.timestampOffset=job.chunkStart
                  }
                  else{
                    sourceBuffer.timestampOffset=sourceBuffer.buffered.end(0)
                  }   

                    //}
                    // else{
                    //     sourceBuffer.appendWindowStart=job.chunkStart
                    // }
                  //  //
                     //  flagSeek8=false;
                       //flagSeek11=false;
                   // }
                //    else{
                       //sourceBuffer.timestampOffset=sourceBuffer.buffered.end(0);

                //     }

                    // if(sourceBuffer.buffered.length>0 && currentTime>4 && (sourceBuffer.buffered.end(0)-sourceBuffer.buffered.start(0))>6 && (currentTime-sourceBuffer.buffered.start(0))>4){
                    //     console.log("start",sourceBuffer.buffered.start(0),currentTime)
                    //     sourceBuffer.remove(sourceBuffer.buffered.start(0),currentTime-2)
                    //     ii=ii-1
                    //     flagRemoval=true
                    // }
                    if(!flagRemoval && job.outputData!=null && job.outputData.byteLength>10000){
                        // console.log("ouputData",job.outputData)
                        sourceBuffer.appendBuffer(job.outputData);
                        videoEl.dispatchEvent(new Event('play'))
                    }
                    // else{
                    //     flagSeek8=true;
                    //     sourceBuffer.dispatchEvent(new Event("updatend"));
                    // }
                    flagRemoval=false;
                    flagSeek2=false

                }
                flagSeek4=false;
                flagRemoval=false;
            });
            var job = await getCompletedJob(ii++);
           job.outputData!=null && job.outputData && sourceBuffer.appendBuffer(job.outputData);
           flagStart=true;
        });
        var index = 0;
        var durationLeft = duration;
        var chunkStart = 0;
        let startByte=0;
        let endByte=block_size
        let l=0;
        let p=0;
        let frameStart=0
        let frameEnd=frameTimes[0]
        let chunkFrameStart=0;
        let chunkFrameDuration=1
        let durationFrameLeft=frameTimes[0]
        let flagFrame=true;
        let chunkFrameId=0
        let durationFrame=frameTimes[0];
        let chunkFrameFlag=true;
        let sizeOFFile=0
        let numFrame=0
        let diff=frameNumbers[0]
        let flagEndPart=false
        let startTimeFrame=frameTimes[0]
        while (frameNumbers.length){
          // if(frameTimes[0]===0){
          //   diff=frameNumbers[1]+ frameNumbers[0]
          //   frameNumbers.shift()
          //   frameTimes.shift()
          //   durationFrameLeft=frameTimes[0]
          //   durationFrame=frameTimes[0]
          //   frameEnd=frameTimes[0]
          // }

          // if(frameNumbers.length===0){
          //   flagEndPart=true
          // }
            let chunkDuration = durationLeft > chunkDurationSize ? chunkDurationSize : durationLeft;
            durationFrameLeft=durationFrame-chunkFrameStart

            chunkFrameDuration=durationFrameLeft>5 ?5:durationFrameLeft
            chunkFrameFlag=durationFrameLeft>5 ?false:true
            if(chunkFrameDuration<0){
                chunkFrameDuration=chunkFrameDuration*-1
            }
            jobs.push({
                id: index,
                chunkStart: toFixed(chunkStart,2),
                chunkDuration: chunkDuration,
                state: 'queued',    // queued, running, done
                outputData: null,
                oncomplete: null,
                promiseReject:undefined,
                startByte:startByte,
                endByte:endByte,
                frameTime:frameTimes[0],
                frameStart:frameStart,
                frameEnd:frameEnd,
                chunkFrameStart:toFixed(chunkFrameStart,2),
                chunkFrameDuration:toFixed(chunkFrameDuration,2),
                chunkFrameId:chunkFrameId,
                numFrame:frameNumbers[0],
                startTimeFrame:startTimeFrame
            });
            
            // if(jobs[index].frameTime===0){
            //   jobs[0].frameTime=1
            // }

            
            chunkFrameStart+=chunkFrameDuration
            

            if(chunkFrameFlag){
                // jobs[index].chunkFrameDuration=frameEnd-chunkFrameStart
                chunkFrameStart=frameEnd
            }
           if(chunkFrameStart>=frameEnd){
            flagFrame=true
           }
            if(index===0){
                jobs[0].chunkDuration=1
                chunkDuration=1
                jobs[0].chunkFrameDuration=1
                chunkFrameDuration=1
                jobs[0].frameTime=1
            }

            let jobs2={
                id: chunkFrameId,
                chunkStart: toFixed(startTimeFrame,2),
                chunkDuration: chunkDuration,
                state: 'queued',    // queued, running, done
                outputData: null,
                oncomplete: null,
                promiseReject:undefined,
                startByte:startByte,
                endByte:endByte
            };
            // if(index===0){
            //     jobs2[0].chunkDuration=durationChunk
            //     chunkDuration=durationChunk
            // }
            console.log(frameNumbers)
            console.log(frameTimes)
            console.log(jobs[index])
            await addObject(db,jobs[index])
          
            if(flagFrame){
              if(index===0){
                await ffmpegs[l].exec(['-ss',`${jobs[index].startTimeFrame}`,'-t',`${jobs[index].frameTime}`,'-i',name,'-threads','4', '-vsync', 'cfr','-frames:v',`${diff+15}`,'-c','copy',`output.${ext}`]);

              }
              else{
                await ffmpegs[l].exec(['-ss',`${jobs[index].startTimeFrame}`,'-t',`${jobs[index].frameTime}`,'-i',name,'-threads','4', '-vsync', 'cfr','-frames:v',`${diff+2}`,'-c','copy',`output.${ext}`]);

              }
                let dataObj=await ffmpegs[l].readFile(`output.${ext}`)
                // console.log(dataObj)
                jobs2.outputData=new Uint8Array(dataObj);
                sizeOFFile+=dataObj.byteLength
                await addObject(db2,jobs2)
                if(chunkFrameStart>=frameEnd){
                durationFrameLeft=frameEnd-frameStart
                chunkFrameId=chunkFrameId+1
                if(frameNumbers.length>1){
                  diff=frameNumbers[1]-frameNumbers[0]

                }
                else{
                  diff=frameNumbers[0]
                }
                if(index!=0){
                startTimeFrame=frameTimes[0]
                }
                frameTimes.shift()
                frameNumbers.shift()
                frameStart=frameEnd
                frameEnd=frameTimes[0]
                durationFrame=frameEnd-frameStart
                chunkFrameStart=0;
              }
                // console.log(sizeOFFile)
                // console.log(filesize)
                // if(sizeOFFile>=filesize*3){
                //   break;
                // }

            }
           flagFrame=false;
            chunkStart =chunkStart+chunkFrameDuration;
       //     if(chunkStart<0){chunkStart=0}
            durationLeft=duration-chunkDuration+chunkDurationSize
            startByte=endByte;
            endByte=startByte+block_size
            // if(jobs[index].frameStart>frameTimes[0]){
              //  jobs[index].frameStart=0;
                //jobs[index].frameTime=job[index].chunkStart
            //}
           // frameStart=frameStart+1
            index++
            l=l+1;
            if(l===2){
                l=0;
            }
        
           
        }
        var currentSeek=0;
        // let jobStart={id:chunkFrameId,outputData:(await fetchFile(fileUrl,0,50000))}

        // await addObject(db2,jobStart)
        // let currentSeek=chunkStart;
        // let flagSeek=false;
       // let flagSeek=false;
        mediaSourceURL = URL.createObjectURL(mediaSource);
        // videoEl.srcObject=new MediaStream();
        videoEl.src = mediaSourceURL;
        var jobQueue = [];
        let totalPromise;
        var flagSeek=false;
        var flagSeek2=false;
        var flagSeek3=false;
        let flagSeek6=true;
        let flagSeek12=false;
        // let newArrayBuffer=new ArrayBuffer(sizeOFFile)
        // let newArray=new Uint8Array(newArrayBuffer)
        // let offsetFile=0
        console.log(chunkFrameId)
        let inputPaths=[]
        // await ffmpegs[0].createDir(`output`)
     const root = await navigator.storage.getDirectory();
 // currentDirHandle.getDirectoryHandle(dirName, { create: true });
        let outputFiles=[]
        for(let f=0;f<chunkFrameId;f++){
          let chunkData;
           let jobFile=await getObject(db2,f);
          inputPaths.push(`file /output/file_${f}.mkv`)
          let outputFile=`file_${f}.mkv`
          const fileHandle = await root.getFileHandle(outputFile, { create: true });
          const writable = await fileHandle.createWritable();
         await writable.write(jobFile.outputData.buffer)
          await writable.close()
          outputFiles.push(await fileHandle.getFile())
          console.log(f)
          //  const blob = new Blob([jobFile.outputData], { type: 'video/matroska' });
          // const FileChunk=new File([blob],`file_${f}.mkv`,{type:'video/matroska'});
          // console.log(FileChunk)
          // await ffmpegs[0].mount('WORKERFS', { files: [FileChunk] }, `output`)
          // if(f!=0 && f!=chunkFrameId-1){
      //     await ffmpegs[0].writeFile("chunk.mkv",new Uint8Array(jobFile.outputData));
      //     await ffmpegs[0].exec(['-i',"chunk.mkv","-c","copy",'-f','rawvideo', "output_chunk.raw"])
      // chunkData=await ffmpegs[0].readFile("output_chunk.raw")
          //  }
          //  else{
          //   await ffmpegs[0].writeFile("chunk.mkv",new Uint8Array(jobFile.outputData));
          //   chunkData=await ffmpegs[0].readFile("chunk.mkv")
          //  }
        // if(f===0){
        //     chunkData=await getObject(db2,chunkFrameId)
        // }
         // console.log(chunkData)
  //        newArray.set(new Uint8Array(chunkData),offsetFile)
      //    offsetFile=offsetFile+chunkData.byteLength
        }
        console.log("ghj")
        await ffmpegs[0].createDir(`output`)
        await ffmpegs[0].mount('WORKERFS', { files: outputFiles}, `output`)
        await ffmpegs[0].writeFile('concat_list.txt', inputPaths.join('\n'));
        await ffmpegs[0].exec(['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt','-c','copy', `output_-1.mkv`]);
        console.log("Abc");
        let chunkData=await ffmpegs[0].readFile("output_-1.mkv")
        console.log(chunkData)
        const stream = new ReadableStream({
        async start(controller) {
          let outputFile
          //try{
          //   outputFile = await ffmpegs[0].open("output.mkv",'r');

          // }
          // catch(err){
          //   console.log(err)
          // }
          //   console.log(outputFile)
            const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size
            let position = 0;
      
            async function push() {
              // let chunk=new SharedArrayBuffer(CHUNK_SIZE)
              let chunk2=new Uint8Array(CHUNK_SIZE)
              try{
               var {bytesRead,chunk} =await ffmpegs[0].read("output_-1.mkv",chunk2, 0, CHUNK_SIZE, position);
              }
              catch(err){
                console.log(err)
              }
              // console.log(chunk)
              if (bytesRead > 0) {
                position += bytesRead;
                controller.enqueue(chunk.slice(0, bytesRead));
                await push();
              } else {
                controller.close();
              }
            }
      
            await push();
          }
        });
        const response = new Response(stream);
        const blob2 = await response.blob();
        const url2 = URL.createObjectURL(blob2);
        const a2 = document.createElement('a');
        a2.href = url2;
        a2.download = 'outputFile.mkv';
        document.body.appendChild(a2);
        a2.click();
        document.body.removeChild(a2);
        URL.revokeObjectURL(url2);


        // const blob = new Blob([newArray], { type: 'video/matroska' });
        // const url2 = URL.createObjectURL(blob);
        // const a = document.createElement('a');
        // a.href = url2;
        // a.download = 'combined-file.mkv'; // Set the desired filename
        // document.body.appendChild(a);
        // a.click();
        // document.body.removeChild(a);
        // URL.revokeObjectURL(url2);
        // let interval=undefined;
        videoEl.addEventListener('seeking',(e)=>{
          //  e.preventDefault();
        //   if(sourceBuffer.buffered.length>=1 && videoEl.buffered.start(videoEl.buffered.length-1)<=currentTime && videoEl.buffered.end(videoEl.buffered.length-1)>=currentTime){
        //     return;
        // }
            seeking=true
            flagSeek=true;
            flagSeek2=true;
            flagSeek3=true;
            flagSeek12=true;
            flagSeek4=true
          // videoEl.dispatchEvent("play");
        })
    
        videoEl.addEventListener('seeked',async (e)=>{
            console.log(currentSeek);
          // console.log(videoEl.buffered.start(videoEl.buffered.length-1))
          // console.log( videoEl.buffered.end(videoEl.buffered.length-1))
            for(let m=0;m<videoEl.buffered.length;m++){

                if(videoEl.buffered.length>=1 && videoEl.buffered.start(m)<=currentTime && videoEl.buffered.end(m)>=currentTime){
                    currentSeek=e.target.currentTime
                    return;
                }
            }
            // if(sourceBuffer.buffered.length>=1 && videoEl.buffered.start(videoEl.buffered.length-1)<currentSeek && videoEl.buffered.end(videoEl.buffered.length-1)>currentSeek){
            //     return;
            // }
            e.preventDefault();

       
            // flagSeek2=false;
            
            if(currentSeek<0){
                currentSeek=0;
            }
            // if(sourceBuffer.buffered.length>=1 &&  currentSeek<sourceBuffer.buffered.start(0)){
            //     jobQueue=[];
            //     jobs.map((job) => jobQueue.push(job));
            // }
            console.log(x,".................")
            flagSeek6=false;
            let copy=x
            for(let i=index2;i<copy;i++){
                try{
                    await jobs[i].promiseReject();
                }
                catch(err){
                    console.log(err);
                }
            }
            flagSeek6=true;
            counterDelay=0;
           controller.abort();
           controller=new AbortController();
           signal=controller.signal
           if(mediaSource.readyState==='open'){
                // sourceBuffer.abort();
                // URL.revokeObjectURL(mediaSourceURL);
                // mediaSource.duration = duration;
                //  sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                //  sourceBuffer.mode = 'segments';\
            }
            jobQueue=[]
            jobs.map(job=>jobQueue.push(job))
            let pIndex=1
       let copyByte=0;
        let flagShard=true
    //      for(let o=0;o<jobs.length;o++){
    //       let obj=jobs[o]
    //     // console.log(obj);
    //       if(obj.chunkStart===currentSeek -3){
    //         console.log(obj)
    //      //   copyByte=Math.ceil(obj.startByte/shardCount);
    //         flagShard=false
    //        // offset=Math.trunc(block_size*(obj.chunkStart)/2)
    //         copyByte=Math.trunc((100000/size) *obj.chunkStart-durationChunk);
    //         // if(flagChunk){
    //         //   offset=Math.trunc(byteSize*(obj.chunkStart))
    //         //   copyByte=Math.trunc((byteSize*(obj.chunkStart))/6)
    //         // }
    
    //        //job.offset=copyByte;
           
    //       }
    //       if(flagShard===false ){
    //        // console.log(copyByte)
    //             obj.startByte=copyByte
    //         obj.offset=copyByte;
    //         copyByte=obj.startByte+block_size
    //         // if(pIndex===1){
    //         //   copyByte=copyByte
    //         // }
    //         obj.endByte=copyByte;
    //         pIndex=pIndex+1
            
    
    //        }
    //       jobQueue.push(obj)
    //    // }) 
    //      }
            console.log(currentSeek);
            //videoEl.dispatchEvent(new Event('seeked'));
           // jobs.map((job) => jobQueue.push(job));
             g=jobQueue[0];
                while(g.chunkStart<currentSeek){
                    g=jobQueue.shift();
                }
                if(g.id!=0){
                    jobQueue.unshift(jobs[g.id])
                    jobQueue.unshift(jobs[g.id-1])
                }
                else{
                    jobQueue.unshift(jobs[g.id]) 
                }
               // e.target.currentTime=g.chunkStart
               // currentSeek=g.chunkStart
                console.log(jobQueue.length,"..............ddddddddddd");
                console.log(jobQueue[0])
                index2=jobQueue[0].id;
                x=jobQueue[0].id
                g=jobQueue[0]
                seekII=true;
                flagSeek8=true;
                // g.chunkDuration=g.chunkDuration + g.chunkStart-currentSeek
                // g.chunkStart=currentSeek;
                seeking=false
                ii=index2
                flagRemoval=true
               // mediaSource.dispatchEvent(new Event("sourceopen"))
               sourceBuffer.buffered.length>=1  &&  sourceBuffer.remove(sourceBuffer.buffered.start(0),sourceBuffer.buffered.end(0))
                //videoEl.play();
           
        })
        // videoEl.addEventListener('seeking', async (e) => {
        //     // if(e.target.currentTime%1!=0){
        //     //     videoEl.currentTime=Math.trunc(e.target.currentTime);
        //     //     return;
        //     // }
           
           
        // });


        var x=0;
        jobs.map((job) => jobQueue.push(job));
        let g=jobQueue[0]
        var counterDelay=0
    let countEnd=0;
    let inputFileChunk = `/file2.${ext}`
    // let addition=jobs[0].frameTime
    let additionEnd=0
    console.log(jobs.length)
    let addition=jobs[0].frameTime
    let copySeek=0;
        while (x<jobs.length)  {
            // if(x && x%3==0  && !flagSeek){
            //     await delay(6000);
            // }
           // console.log(jobQueue[0]);
            // if(counterDelay!=0 && counterDelay %3==0 && !flagSeek3){
            //     // flagSeek=false;
            //     console.log("hanan");
            //     await delay (7000);
            
            // }
            // for(let k=(block_size*x+1);k<(block_size*x+4);k++){
            //     typedArray[k]=0
            // }
            counterDelay=counterDelay+1
            if(flagSeek6){

            let promiseRejects=[];
            let Promises=ffmpegs.map(async (ffmpeg) => {
                
                return new Promise(async(resolve,reject)=>{
                let job = null;
                promiseRejects.push(resolve)
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
                //if(job.length>0)
                job = jobQueue.shift();
                if(job===undefined){
                    console.log("No Job...............")
                    reject("No Job");
                    return;
                }
            //    console.log("skip",skip);
                hasAudio=true
                if(job.endByte>filesize){
                    job.endByte=filesize;
                    countEnd=countEnd+1
                }
                console.log(countEnd)
                job.state = 'running';
                console.log(`Segment start: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                //await new Promise((r) => setTimeout(r, 1000));
                let outputFile = `/output.${job.id}.mp4`;
                
                let temp_video= `/temp_video_${job.id}.mp4`;
                let temp_audio= `/temp_video_${job.id}.aac`
                let copyStartByte=job.startByte;
                let copyEndByte=job.endByte
               // const fileBuffer =  // Example range, modify as needed
               if(countEnd<2){
                    console.log(job.startByte,job.endByte)
                    if(job.startByte>0)
                    {
                        copyStartByte=copyStartByte-100000
                        copyEndByte=copyEndByte+100000
                    
                    }
               //     new Uint8Array(await fetchFile(fileUrl, copyStartByte, copyEndByte))
               }
            //    console.log(typedArray)
               let inputChunkFile=`file_${job.id}.webm`
               let z=(await getObject(db2,job.chunkFrameId)).outputData
               //console.log(z);
                await ffmpeg.writeFile(inputFileChunk,new Uint8Array(z));
                // await ffmpeg.exec([ '-loglevel',
                //         'debug','-skip_initial_bytes','1000','-i',inputChunkFile,'-i','metadata.txt','-map_metadata','1','-c','copy',inputFileChunk])
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                if(job.id===0 ){
                  let plus=0;  
                  // if(job.id==1){
                  //     plus=jobs[0].frameTime
                  //   }
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel',
                        'error',
                    //  '-analyzeduration', '0',
                    //  '-probesize','32',
                  //  '-skip_initial_bytes','10000',
                    //  '-fflags', '+discardcorrupt', 
                    // '-err_detect', 'ignore_err',
                       // '-avoid_negative_ts', 'make_zero',
                        // '-ss', `${plus}`,

                        '-i', inputFileChunk,    
                        '-threads','4',

                     //   '-flags', 'low_delay' ,'-vf', 'setpts=0',
                        // '-i','metadata.txt',
                        // "-map_metadata", "1",
                        '-an',                
                        //'-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
                     // '-t', `${2}`,
                  ///   '-t', `${job.chunkFrameDuration}`, 
                        '-preset', 'ultrafast',
                      //  '-tune','zerolatency',
                        

                        '-c:v', 'libx264',
                        '-crf', '30',
//'-force_key_frames', 'expr:gte(t,n_forced*1)',                 //    '-fflags', 'nobuffer',
                        `/temp_video_${job.id}.mp4`,     
                    ],undefined,{signal});
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        // '-ss', `${plus}`,
                //    '-analyzeduration', '0',
                //    '-probesize','32',

                  // '-skip_initial_bytes','10000',

                //    '-fflags', '+discardcorrupt', 
                //    '-err_detect', 'ignore_err',
                        '-i', inputFileChunk,   
                        '-threads','4',

                        // '-i','metadata.txt',
                        // "-map_metadata", "1",
                        '-map', '0:a',
                        
                        // Assuming '0:a' selects the first audio stream  
                        '-vn',     
                  //      '-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
                 // '-t', `${job.chunkFrameDuration}`, 
                    //  '-t', `${1}`,
                    //   '-tune','zerolatency',

                        '-c:a', 'aac',        
                        '-b:a', '192k',      
                        `/temp_audio_${job.id}.aac`,    
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
                      //'-analyzeduration', '0',

                        '-i', `/temp_video_${job.id}.mp4`,  
                        '-i', `/temp_audio_${job.id}.aac`,  
                        '-threads','4',

                        '-c:v', 'copy',          
                        '-c:a', 'aac',          
                        '-b:a', '192k',
                             
                        '-movflags', 'frag_every_frame+empty_moov+default_base_moof+omit_tfhd_offset',
                        '-af', 'aresample=async=1',
                        '-f','mp4',     
                        outputFile,            
                    ],undefined,{signal});
                }
                let dura=1
                // if(flagSeek3){
                //     dura=19
                // }
                // if(job.id===index2){
                //     dura=4
                // }
                
                hasAudio=true
                if(hasAudio && job.id!=0 ){
                // if(job.chunkFrameStart==0){
                //   addition=jobs[0].frameTime
                // }
                // else{
                //   addition=0
                // }
                 if(job.id===1){
                addition=0.4
              }
                 else{
                   addition=0
              }
              let seekSkip2=0;
              if(job.id===1){
                seekSkip2=0.5
              }
              // else if(job.chunkStart===0 && job.id!=1){
              //   seekSkip2=1
              // }
              if(job.id===index2 && job.id!=0){
                console.log(job)
              //  seekSkip2=currentSeek-job.chunkStart
                //copySeek=seekSkip2
              }
            //   else if(job.chunkFrameStart==0){
            //     seekSkip2=copySeek
            //   }
                  console.log(" audio.............................")
                    try{
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                        '-threads','4',

                      // '-analyzeduration', '10000000',
                     //  '-probesize','10000000',

                       //'-skip_initial_bytes','10000',

              //     
                        // '-fflags', '+discardcorrupt', 
                        // '-err_detect', 'ignore_err',
                        //'-copyts',  
                     //   '-avoid_negative_ts', 'make_zero',
                       // '-ss', `${job.chunkStart}`, 
 
                      '-i', inputFileChunk, 
                      '-ss',`${job.chunkFrameStart+seekSkip2}`,     
                      //  '-t', `${job.frameTime}`, 
                     '-t', `${job.chunkFrameDuration}`, 

                  //      '-flags', 'low_delay' ,'-vf', 'setpts=0',
                //   '-i','metadata.txt',
                //   "-map_metadata", "1",
                        //                   '-reset_timestamps','1', 

                    //     //
                    //            '-ss',`${job.chunkFrameStart}`,                 
 
                    //   '-t', `${job.chunkFrameDuration}`,
                        
                        '-an',                
                       // '-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
                        '-preset', 'ultrafast',
                   //     '-tune','zerolatency',

                        '-c:v', 'libx264',  
                       // '-vf' ,'"scale=trunc(iw/2)*2:trunc(ih/2)*2"', 

                        '-crf', '30', 
                     //   '-reset_timestamps','1',  
                    //    '-g','10',
                        //'-fflags', 'nobuffer', '-flags', 'low_delay',    
                        //'-g','1', 
                //    '-fflags', 'nobuffer',
// '-force_key_frames', 'expr:gte(t,n_forced*1)',
                        `/temp_video_${job.id}.mp4`,     
                    ],undefined,{signal});
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                    await ffmpeg.exec([
                        '-nostats',
                        '-loglevel', 'error',
                   //     '-analyzeduration', '0',
                   '-threads','4',

            //             //'-skip_initial_bytes','10000',
            //             '-probesize','10000000',
         //   '-ss', `${job.chunkStart}`, 

            //   '-fflags', '+discardcorrupt', 
            //         '-err_detect', 'ignore_err',
            //'-copyts',  

                        '-i', inputFileChunk,
                      '-ss',`${job.chunkFrameStart+seekSkip2}`,     
                      //  '-t', `${job.frameTime}`, 
                     '-t', `${job.chunkFrameDuration}`, 

                       // '-ss',`${job.chunkStart}`,     
                      ///  '-t',`${job.frameTime+2}`,              

//             '-t', `${1}`,
                        // '-i','metadata.txt',
                        // "-map_metadata", "1",
                 
                    //  '-ss',`${job.frameTime}`,            
                    //     '-t', `${1}`,

                        //      
                      //  '-ss', `${job.chunkStart}`,  
                    //                  '-reset_timestamps','1', 
                     //  '-t', `${1}`,

                        '-map', '0:a', // Assuming '0:a' selects the first audio stream  
                        '-vn',    
                      //  '-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
                      //  '-tune','zerolatency',

                      //  '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof', 
                        '-c:a', 'aac',        
                        '-b:a', '192k',
                     //   '-reset_timestamps','1',  
    //   '-fflags', 'nobuffer',
                        `/temp_audio_${job.id}.aac`,    
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
                    // '-analyzeduration', '0',
                    '-threads','4',

                        '-i', `/temp_video_${job.id}.mp4`,  
                        '-i', `/temp_audio_${job.id}.aac`, 

                        '-c:v', 'copy',          
                        '-c:a', 'aac',          
                        '-b:a', '192k',     
                        '-movflags', 'frag_every_frame+empty_moov+default_base_moof+omit_tfhd_offset',
                        '-af', 'aresample=async=1',
                        '-f','mp4',
                        outputFile,            
                    ],undefined,{signal});
                    addition=0
             }
                catch(err){
                    console.log(err)
        //             if(flagSeek12===false){
        //                 await ffmpeg.terminate();
        //                 await ffmpeg.load(loadConfig)
        //                 await ffmpeg.writeFile(inputFileChunk,new Uint8Array(typedArray) );
        //                 await ffmpeg.exec([
        //                     '-nostats',
        //                     '-loglevel', 'error',
                            
        //                 '-analyzeduration', '10000000',
                        
        //                     '-ss', `${job.chunkStart}`, 

        //                     '-i', inputFileChunk,  
        //             //      '-flags', 'low_delay' ,'-vf', 'setpts=0',

        //                     '-t', `${dura}`,

        //                     '-an',                
        //                     '-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
        //                     '-preset', 'ultrafast',
        //                     '-tune','zerolatency',

        //                     '-c:v', 'libx264',  
        //                 // '-vf' ,'"scale=trunc(iw/2)*2:trunc(ih/2)*2"', 

        //                     '-crf', '23', 
        //                 //   '-reset_timestamps','1',  
        //                 //    '-g','10',
        //                     //'-fflags', 'nobuffer', '-flags', 'low_delay',    
        //                 // '-g','0', 
        //                 //'-g','0',   
        //                 //    '-fflags', 'nobuffer',

        //                     `/temp_video_${job.id}.mp4`,     
        //                 ],undefined,{signal});
                            
        //             // if(job.chunkStart<currentSeek){
        //             //     reject();
        //             // }
        //                 await ffmpeg.exec([
        //                     '-nostats',
        //                     '-loglevel', 'error',
        //                     '-analyzeduration', '0',

        //                     '-ss', `${job.chunkStart}`, 


        //                     '-i', inputFileChunk,
        //                     '-t', `${dura}`,

        //                     '-map', '0:a', // Assuming '0:a' selects the first audio stream  
        //                     '-vn',    
        //                     '-movflags', 'frag_every_frame+empty_moov+default_base_moof', 
        //                     '-tune','zerolatency',

        //                 //  '-movflags', 'faststart+frag_every_frame+empty_moov+default_base_moof', 
        //                     '-c:a', 'aac',        
        //                     '-b:a', '192k',
        //                 //   '-reset_timestamps','1',  
        // //   '-fflags', 'nobuffer',
        //                     `/temp_audio_${job.id}.aac`,    
        //                 ],undefined,{signal});
        //                 // if(flagSeek){
        //                 //     flagSeek=false;
        //                 //     reject();
        //                 // }
                            
        //             // if(job.chunkStart<currentSeek){
        //             //     reject();
        //             // }
        //                 await ffmpeg.exec([
        //                     '-nostats',
        //                     '-loglevel', 'error',
        //                 // '-analyzeduration', '0',

        //                     '-i', `/temp_video_${job.id}.mp4`,  
        //                     '-i', `/temp_audio_${job.id}.aac`, 
        //                     '-c:v', 'copy',          
        //                     '-c:a', 'aac',          
        //                     '-b:a', '192k',     
        //                     '-movflags', 'frag_every_frame+empty_moov+default_base_moof+omit_tfhd_offset',
        //                     '-af', 'aresample=async=1',
        //                     '-f','mp4',
        //                     outputFile,            
        //                 ],undefined,{signal});
        //         }
        //         else{
        //             throw "error"
        //         }
                }
            }
                           
                // if(job.chunkStart<currentSeek){
                //     reject();
                // }
                else if(job.id!=0 ){
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
                    job.state = 'done';
                    let outputData = await ffmpeg.readFile(outputFile);
                    await updateObject(db,job.id,"outputData",outputData);
                    job.state = 'done'
                    job.state = 'completed'
                    // console.log("complete",job)
                   
                } catch {
                    console.log(job.id,'Error reading output video');
                  job.state="completed"
                    console.log(index2)
                    //resolve("OK")
                }
              
                console.log(`Segment done: ${job.id} ${job.chunkStart} ${job.chunkDuration}`);
                if (job.oncomplete) job.oncomplete();
                if(flagSeek3===true && job.id==index2){
                    flagSeek4=false;
                    flagRemoval=false;
                    sourceBuffer.dispatchEvent(new Event('updateend'))
                    flagSeek3=false;
                }
                try {
                    
                 //   if(hasAudio){
                        console.log("skdsakdsak................................temp-video")
                        await ffmpeg.deleteFile(`/temp_audio_${job.id}.aac`);
                        await ffmpeg.deleteFile(`/temp_video_${job.id}.mp4`);
                   // }
                    console.log("output file................................")
                    await ffmpeg.deleteFile(outputFile);
                    //  await ffmpeg.deleteFile(inputFileChunk)
                    
                    
                } catch {
                    console.log(job.id,'Error deleting output video');
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
            flagSeek12=false;
        }  
        }
    }
    await Promise.all(ffmpegs.map(async (ffmpeg) => {
        let useWorkerFS=false;
        if (useWorkerFS){
            await ffmpeg.unmount(inputDir);
        }
        await ffmpeg.deleteDir(inputDir);
    }));
}

addEventListener("load", async (event) => {
    localFileInput = document.querySelector('#local-file');

    document.querySelector('#playbtn').addEventListener('click', async () => await transcodeLocalFileInputToMediaSource());
    loadBtn = document.querySelector('#load-button');
    loadBtn.addEventListener('click', async () => await load());
    loadBtn.removeAttribute('disabled');
    logDiv = document.querySelector('#log-div');
    videoEl = document.querySelector('#video-result');
    console.log('window loaded');

});
async function handleSubmit(event) {
    event.preventDefault(); 
    fileUrl = document.getElementById('url').value;
    ext = document.getElementById('extension').value;

    alert(`URL: ${url}\nExtension: ${extension}`);
}

function logVideoEvent(e) {
    var debugTable = document.getElementById("videoDebug");
    if (!debugTable) {
        debugTable = document.createElement("table");
        debugTable.id = "videoDebug";
        debugTable.innerHTML = '<tr><td>time</td><td>target</td><td>name</td><td>ct</td><td>ns</td><td>rs</td><td>dur</td><td>error</td><td>bc</td><td>last buffer</td></tr>';
        document.body.appendChild(debugTable);
    }
    var tr = document.createElement("tr");
    if (debugTable.children.length > 1) {
        debugTable.insertBefore(tr, debugTable.children[1]);
    } else {
        debugTable.appendChild(tr);
    }
    var date = new Date();
    tr.innerHTML = '<td>' + (date.getHours() + ":" + date.getMinutes() + ":<b>" + date.getSeconds() + "." + date.getMilliseconds()) + '</b></td><td>' + Object.getPrototypeOf(e.target).constructor.name + '</td><th>' + e.type + '</th><td>' + videoEl.currentTime + '</td><td>' + videoEl.networkState + '</td><td>' + videoEl.readyState + '</td><td>' + videoEl.duration + '</td><td>' + (videoEl.error ? videoEl.error.code : '-') + '</td><td>' + videoEl.buffered.length + '</td><td>' + (videoEl.buffered.length ? (videoEl.buffered.start(videoEl.buffered.length - 1) + " - " + videoEl.buffered.end(videoEl.buffered.length - 1)) : 0) + '</td>' ;
}

function attachVideoDebug(video) {
    var events = ["loadstart", "progress", "suspend", "abort", "error", "emptied", "stalled", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "seeking", "seeked", "ended", "durationchange", "timeupdate", "play", "pause", "ratechange", "resize", "volumechange"];
    for (var i=0; i<events.length; i++) {
        video.addEventListener(events[i], logVideoEvent);
    }
}

function attachBufferDebug(sourceBuffer) {
    var events = ["updatestart", "update", "updateend", "error", "abort" ];
    for (var i=0; i<events.length; i++) {
        sourceBuffer.addEventListener(events[i], logVideoEvent);
    }
}