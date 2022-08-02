//SETUP ------------------------------------------------------------------
// dom elements
const instr = document.getElementById("instr")
const present = document.getElementById("present") //STIM---
const absent = document.getElementById("absent") //absent/background stim https://qa.ostack.cn/qa/?qa=590338/
const patch = document.createElement('canvas') // single gabor patch https://stackoverflow.com/questions/11849114/html5-canvas-putimagedata-translate-it-change-image
const resp = document.getElementById("resp") //RESPONSES---
const resp_text = document.getElementById("resp_text")
const left = document.getElementById("left") // for mouse/touchscreen repsonses
const right = document.getElementById("right")
const conf = document.getElementById("conf") //CONFIDENCE---
const conf_sl = document.getElementById("conf_sl") // slider
const conf_val = document.getElementById("conf_val") // text underneath displaying %
const conf_b = document.getElementById("conf_b") // submit
//canvas setup
const pctx = present.getContext("2d")
const actx = absent.getContext("2d")
const gctx = patch.getContext("2d")

// stim size - wrap in function?
const px_cm =  getQueryVariable("px_cm") //pixels per cm, got from the previous survey using a credit-card div box resize
const stim_size = Math.ceil(13*px_cm) //truncated in practice? - although the separate var will stay in memory as a float so truncate to avoid rounding error (and aliasing?) https://stackoverflow.com/questions/4308989/are-the-decimal-places-in-a-css-width-respected
present.height = stim_size //HTML width and height define coordinates JS uses to draw
present.width = stim_size //note: ctx.canvas.width = canvas.width https://stackoverflow.com/questions/67457317/what-is-the-difference-between-doing-context-canvas-width-and-canvas-width
absent.height = stim_size
absent.width = stim_size 
const patch_size = Math.ceil(4*px_cm) //or floor?
patch.width = patch_size  //note: don't set CSS as it stretches/compresses (zooms in or out) if set https://stackoverflow.com/questions/4938346/canvas-width-and-height-in-html5 ; https://stackoverflow.com/questions/2588181/canvas-is-stretched-when-using-css-but-normal-with-width-height-properties
patch.height = patch_size

// init exp vars
let task_variant = "YN" //yes/no a.k.a. stimulus present/absent task; "YN" or "2AFC"
const num_block = 5 //split tasks into equal blocks
const n_trial = 10 //number of experimental trials for each task
const n_prac = 10 //number of practice trials
const trial_order = trialOrder() //order of trials
let trial_n = 0 //resets to 0 for each task variant (i.e. 2AFC)
let start_time //marks the beggining of a trial
const p_data = []
const correct = []
let breaker = false
let instructions = false
//contrast settings [see: Wolfe & Kluender (2018) Sensation & Perception 5th ed. p.68]
let min = 25 //initialise to ((230-25)/(230+25))*100 =80.41% in line with maximum in supplementary to Fleming et al. (2010) https://www.science.org/doi/full/10.1126/science.1191883?casa_token=fQOIIa6gW8YAAAAA:kEdkY6WQHiY1GB5jMjx9v80gfcQPEVhy_CKd5KnUrvOFtAqnp_m9G1RUmIC5RzOj6JtjIrBtkYOM
let max = 230 //range 0-255; baseline stim are min=102,max=153 . 92,163 is fairly abmiguous for testing.
let increment = 8 //amount to change stim intensity by - halves every 10 trials till reaches 1
absentStim() // create baseline stim

//start exp
document.addEventListener('keydown',continueListener,true)
document.addEventListener('click',continueListener,true)

// HELPER FUNCTIONS ------------------------------------------------
function continueListener(e){
    if(e instanceof KeyboardEvent && !(e.key===' '||e.code==='Space'||e.keyCode===32)){ return 
    } else {
        document.removeEventListener('keydown',continueListener,true)
        document.removeEventListener('click',continueListener,true)
        runTrial()
    }
}

function getQueryVariable(variable){ //https://css-tricks.com/snippets/javascript/get-url-variables/
    const vars = window.location.search.substring(1).split("&")
    const vars_l = vars.length
    let pair
    for (let i=0; i<vars_l; i++) {
            pair = vars[i].split("=")
            if(pair[0] === variable){return pair[1]}
    }
    return(false)
}

function shuffle(array) { //Fisher-Yates (aka Knuth) Shuffle.
    let currentIndex = array.length, randomIndex
    while (currentIndex != 0) { // While there remain elements to shuffle
      randomIndex = Math.floor(Math.random() * currentIndex) // Pick remaining element
      currentIndex--
      ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]] // swap with current element.
    }
    return array;
}

// trial order
function trialOrder(){
    const all_trials = (n_trial+n_prac)-5 //cieling makes sure there's enough with odd numbers of trials
    const type_a = Array(all_trials).fill('present') //if 2AFC then present first, if YN then only present
    const type_b = Array(all_trials).fill('absent')
    let trial_order = type_a.concat(type_b)
    trial_order = shuffle(trial_order)
    trial_order.unshift('present','present','absent','absent','present') //5 practice trials
    return trial_order
}

// delay for task loop
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

//staircasing function
function staircase(){
    const back1=correct[trial_n-1]
    let back2=false //else pretend two trials ago was false anyway, so that intensity isn't changed. 
    // check for 2 correct responses in a row
    const last_correct_count = correct.slice().reverse().findIndex(correct_trial => correct_trial === false); //copy array, reverse it, find first ocurrence. => passes index and tests
    if( (last_correct_count===-1 && trial_n%2===0 && trial_n>1) || (last_correct_count > 0 && last_correct_count%2 === 0) ){ //no incorrect (-1) and even trial number OR even correct trials since last incorrect
        back2 = correct[trial_n-2] 
    }
    // adjust stim intensity. range 23-80%. increments of 3% were used in Fleming et al. (2010), above.
    if(trial_n%10===0 && increment>1){ increment/=2 } //every 10 trials half the increment. note (16/255)*100 = 6.27 = ~6%; 8=~3... 
    if(max-min<2 || (max-increment)-(min+increment)<2){return} //let luminance = ((max-min)/(max+min))*100 //(see Wolfe & Kluender, 2018, p.68)
    if(back1===false && trial_n>1){ //reduce difficulty by increasing intensity
        min -= increment //note always an equal change to min/max to converge around the middle grey
        max += increment //minimum (2/255)*100=0.78% of colour range. 1+/-127=0.79% luminance
    } else if(back1 && back2){ //increase difficulty by reducing intensity
        min += increment
        max -= increment
    }
    if(min<0||max>255){min=0;max=255} //out of bounds
}

//STIM CREATION -------------------------------------------
function sineGrating(min,max,_callback){ //draw sinewave grating on the rotated main gabor canvas in the patch size https://learninglink.oup.com/access/content/wolfe-5xe-student-resources/wolfe-5xe-activity-3-3-gabor-patches
    ///HERE IS THE PROBLEM when called by target stim isn't clearing on the rotated canvas
    //context.clearRect(0, 0, patch_size, patch_size); //remove what's there currently - call on context to leave a baseline (absent) stim untouched
    const h=patch_size/2 // midpoint - amplitude
    const f=10/patch_size // cycles per canvas - frequency
    let y=0, y_col=0
    for(let x=-patch_size; x<patch_size; x++){
        y = h-h*Math.sin(x*2*Math.PI*f) // https://stackoverflow.com/questions/29917446/drawing-sine-wave-in-canvas
        y_col = Math.abs((y/patch_size)*(max-min)+min) //normalise to contrast range https://stats.stackexchange.com/questions/281162/scale-a-number-between-a-range
        gctx.strokeStyle = 'rgb('+y_col+','+y_col+','+y_col+')'
        gctx.beginPath()
        gctx.moveTo(x,-patch_size)
        gctx.lineTo(x,patch_size)
        gctx.stroke()
    }
    _callback() //run arrow function in gaussianWindow https://www.w3schools.com/js/js_asynchronous.asp
}

function gaussianWindow(min,max){ //draws a patch on the patch canvas kept in memory
    sineGrating(min,max,()=>{ //waits for sine wave grating to finish before using window 
        let canvas_data = gctx.getImageData(0, 0, patch_size, patch_size)
        // gaussian distribution parameters:
        const height = 255 //255 is maximum alpha, higher defaults to this in practice - increase height to change area of full contrast
        const mean = patch_size/2
        const sd = patch_size/8
        // change pixel alpha based on distance from centre
        let row, col, distance, gaus_alpha //redeclaration is slower
        const cdl = canvas_data.data.length
        for(let i=0; i<=cdl; i+=4){
            row = (i/4) % patch_size
            col = ((i/4) - row) / patch_size
            distance = Math.sqrt(((row-mean)**2) + ((col-mean)**2)) //https://stackoverflow.com/questions/20916953/get-distance-between-two-points-in-canvas
            gaus_alpha = height*Math.exp(-0.5*((mean-distance)-mean)**2/sd**2) //https://stackoverflow.com/questions/35020202/making-a-simple-javascript-version-of-a-gaussian-distribution
            canvas_data.data[i+3] = gaus_alpha
        }
        gctx.putImageData(canvas_data, 0, 0)
        //https://www.oreilly.com/library/view/html5-unleashed/9780133151336/ch05a.html
    })
}

function drawPatch(patch_n,context){ //draws the inMemory patch canvas in a specific location (e.g. all for the baseline or just the single target)
    const radius = (stim_size/2)*0.6
    const ang = patch_n * Math.PI/3 //Pi is half circle, /by half num patches
    context.rotate(ang) // rotate degrees out
    context.translate(0, -radius) // move 0 point outwards to radius
    context.rotate(-ang) //  rotate to be horizontal again
    context.clearRect(0, 0, patch_size, patch_size) //clear the canvas at the patch location
    context.drawImage(patch, 0, 0)
    context.rotate(ang) //reverse translations back to centre of square
    context.translate(0, radius)
    context.rotate(-ang)
}

function absentStim() { //creates absent stim - make IIFE?
    const offset = (stim_size/2)-(patch_size/2)
    actx.translate(offset, offset) // translate coordinate matrix to begin circle in centre of canvas
    gaussianWindow(102,153) // create the baseline patch initialise to ((153-102)/(153+102))*100 = 20% in line with supplementary to Fleming et al. (2010) https://www.science.org/doi/full/10.1126/science.1191883?casa_token=fQOIIa6gW8YAAAAA:kEdkY6WQHiY1GB5jMjx9v80gfcQPEVhy_CKd5KnUrvOFtAqnp_m9G1RUmIC5RzOj6JtjIrBtkYOM
    for(let patch_n=1; patch_n<7; patch_n++){
        drawPatch(patch_n,actx)
    }
    actx.translate(-offset, -offset)
    actx.fillText("+", stim_size/2, stim_size/2) //fixation cross
}


// STIM DISPLAY -------------------------------------------
function fixationCross(next_task){
    present.style.display = 'none'
    absent.style.display = 'none'
    conf.style.display = 'none'
    instr.innerHTML = '+' //pctx.fillText("+", stim_size/2, stim_size/2) //fixation cross
    instr.style.display = 'block'
    let delay_time=200
    if(task_variant==="YN"){ delay_time=300 }
    delay(250).then(() => next_task(delay_time))    
}

function Absent(){
    instr.style.display = 'none'
    present.style.display = 'none'
    absent.style.display = 'block'
    let delay_time=200
    if(task_variant==="YN"){ delay_time=300 }
    if(task_variant==="2AFC" && trial_order[trial_n-1] === 'absent'){
        delay(delay_time).then(() => fixationCross(Present)) // try loading stim during this break? better solution: https://zellwk.com/blog/nested-callbacks/
    } else {
        delay(delay_time).then(() => getResp())
    }
}

function Present(){
    instr.style.display = 'none'
    absent.style.display = 'none'
    //reset present stim
    pctx.clearRect(0, 0, stim_size, stim_size)
    pctx.drawImage(absent, 0, 0)
    gaussianWindow(min,max) //create in-memory patch. patch is global atm
    //get location of patch
    const offset = (stim_size/2)-(patch_size/2)
    pctx.translate(offset, offset); // translate coordinate matrix to begin circle in centre of canvas
    const patch_n = Math.floor(Math.random()*6)+1 // choose random patch
    //draw patch on present stim
    drawPatch(patch_n,pctx)
    pctx.translate(-offset, -offset) //just do -1/2 during page load?
    present.style.display = 'block' //show once loaded (or close enough)
    //next task
    let delay_time=200
    if(task_variant==="YN"){ delay_time=300 }
    if(task_variant==="2AFC" && trial_order[trial_n-1] === 'present'){
        delay(delay_time).then(() => fixationCross(Absent)) 
    } else { delay(delay_time).then(() => getResp()) }
}

// TYPE-1 RESPONSE -------------------------------------------
function getResp(){
    present.style.display = "none"
    absent.style.display = "none"
    resp.style.display = "block"
    document.addEventListener('keydown',respList,true)
    left.addEventListener('click', respList, true)
    right.addEventListener('click', respList, true)
    start_time = performance.now()
}

// event listeners
function respList(e){
    //get the response SHORTEN THIS AREA ############################
    let response = ''
    if(e instanceof KeyboardEvent){
        const key_press = e.key.toUpperCase()
        if(key_press===left.value.charAt(0) || key_press===right.value.charAt(0)){
            if(key_press==="Y"||key_press==="1"){ response="present"
            } else if(key_press==="N"||key_press==="2"){ response="absent" }
        } else { return }
    } else { 
        if(e.target.id === 'left'){ response = "present"
        } else  if(e.target.id === 'right'){ response = "absent"}
    }

    if(response != ''){
        resp.style.display = 'none'
        document.removeEventListener('keydown',respList,true)
        left.removeEventListener('click', respList, true)
        right.removeEventListener('click', respList, true)
        const correct_t = response===trial_order[trial_n-1]
        correct.push(correct_t) //just easier and quicker than getting out of the object
        p_data.push({
            'trial_n': trial_n,
            'min': min, 
            'max':max,
            'target':trial_order[trial_n-1],
            'response':response,
            'rt': e.timeStamp - start_time,
            'correct': correct_t
        })

        //move on
        if(trial_n>n_prac){ getConfidence()
        } else { //feedback
            let fdbk
            if(correct_t){ fdbk = 'Correct!'
            } else { fdbk = 'Incorrect'}
            instr.innerHTML = fdbk
            instr.style.display = "block"
            delay(300).then(()=>{runTrial()})
        }
    }
}

// CONFIDENCE -------------------------------------------
function getConfidence(){
    resp.style.display = "none"
    conf_sl.value = 0
    conf_val.innerHTML = "0%"
    conf.style.display = "block"
    document.addEventListener('keydown',confidenceKey, true)
    conf_sl.addEventListener("input", sliderChange, true)
    conf_b.addEventListener("click", confSubmit, true)
}

// event listeners
function sliderChange(){
    conf_val.innerHTML = conf_sl.value+"%"
}

function confidenceKey(e){
    //slider values based on number keys
    if(["`","1","2","3","4","5","6","7","8","9","0"].includes(e.key)){
        let slider_val = 0
        if(e.key === "`"){ slider_val = 0
        } else if(e.key==="0"){ slider_val = 100
        } else {slider_val = Number(e.key)*10}
        conf_sl.value = slider_val
        conf_val.innerHTML = slider_val+"%"
    //enter to continue
    } else if(e.code === 'Enter'){ confSubmit() }
}

function confSubmit(){
    document.removeEventListener('keydown',confidenceKey,true)
    conf_sl.removeEventListener('input', sliderChange,true)
    conf_b.removeEventListener('click', confSubmit, true)
    conf.style.display = 'none'
    p_data[trial_n-1].confidence = conf_sl.value
    runTrial()
}
 
// EXPERIMENT FUNCTIONS  -------------------------------------------
function trialNumber(instr_cb){ // must be a better way to do this? e.g. resolve promises on even listeners https://stackoverflow.com/questions/35718645/resolving-a-promise-with-eventlistener
    if(trial_n===n_trial+n_prac){ 
        if(task_variant==="YN"){ //switch task
            //set up display
            task_variant="2AFC"
            ans_text.innerHTML = 'Did the first or second image contain a patch with higher contrast?<br>'+
                                '<small><i>Please instr using the number keys (1 or 2) or clicking the buttons below.</i></small><br><br>'
            left.value = "1"
            right.value = "2"
            min = 25
            max = 230
            increment = 8
            trial_order = trialOrder()
            trial_n = 0
            correct = [] //note: doing this resets the staircasing
            instructions = true
            breaker = false
            instructions.innerHTML = 'The task will now switch to showing two versions of the images, one after the other. '+
            'Your task is to indicate if the first or second image contained the patch with higher contrast.<br><br>'+
            'As before, the first '+n_prac+' trials are practice trials with feedback.<br><br>'+
            'Please press Spacebar or click anywhere to begin'
        } else if(task_variant === "2AFC"){  //end exp
            document.removeEventListener('keydown',continueListener,true)
            document.removeEventListener('click',continueListener,true)
            //SAVE DATA AND CREATE LINK
            const sbj_id = getQueryVariable("sbj_id")
            const px_cm = getQueryVariable("px_cm")
            const task_order_str = getQueryVariable("task_order") 
            const task_order = JSON.parse(decodeURIComponent(task_order_str))
            const next_task = task_order.findIndex((element) => element === 'gabor')+1
            const link = 'https://users.sussex.ac.uk/mel29/'+task_order[next_task]+'/'+task_order[next_task]+'.html?task_order='+task_order_str+'&sbj_id='+sbj_id+'&px_cm='+px_cm
            saveData(sbj_id,()=>{window.location.replace(link)})
        }   
    } else if((trial_n-n_prac)%(n_trial/num_block)===0 && trial_n>n_prac && trial_n<n_trial+n_prac && breaker===true){ //
        const block_num = (trial_n-n_prac)/(n_trial/num_block)
        instr.innerHTML= 'You have completed '+block_num+' out of '+num_block+' blocks of trials.<br><br>Feel free to take a break, and press spacebar or click anywhere to continue.'
        breaker=false //allows code to bypass the break screen without increasing the trial counter. could just decrease trial counter in function?
        instructions=true
    }
    if(instructions===true){
        conf.style.display = "none"
        instr.style.display = "block"
        document.addEventListener('keydown',continueListener,true)
        document.addEventListener('click',continueListener,true)
    }
    instr_cb()
}

function runTrial(){
    trialNumber(()=>{ //check if anything extra needs to be done on this trial (instructions, switch task variant, etc.)
        if(instructions===true){
            instructions=false
            return //exit if instruction or break screen needs to be presented, and skip once spacebar is pressed
        }
        staircase()
        breaker = true
        trial_n++
        const next_task = trial_order[trial_n-1].charAt(0).toUpperCase() + trial_order[trial_n-1].substr(1)
        fixationCross(window[next_task])        
    })
}

function saveData(sbj_id,next_task){
    const json_data = JSON.stringify({
            file_name: sbj_id + "_gabor", 
            exp_data: p_data
        })
    const xhr = new XMLHttpRequest()
    xhr.onload = function() { next_task() } //move on to next task
    xhr.open('POST', 'https://users.sussex.ac.uk/mel29/gabor/gabor.php', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(json_data)
}

//NOTES--------------------------
//to-do:
    // hide all in div and show class functions: https://stackoverflow.com/questions/10218377/set-display-none-recursively-except-for-within-a-specific-element
    // option to use mouse to select stim
    // credit card resize
    // video game brightness: adjust brightness so squares are or aren't different
    // check other studies
    // lock out people below IE8
    
//fleming 2010 setup
    // The temporal interval and spatial position of the pop-out Gabor varied randomly between trials.
    // The perceptual judgement was indicated by participants using the left hand with the numbers ‘1’ (first interval) or ‘2’ (second interval) 
    // A square red frame (width 1 degree, thickness 0.1 degree) appeared around the selected rating (Fig. 1). 
    // 600 trials, split into 6 blocks of 100 trials.

// could try radial stim: https://www.researchgate.net/publication/253634756_Mixed_Effects_of_Training_on_Transfer/figures?lo=1
// online generator: https://www.cogsci.nl/pages/gabor-generator.php?option=com_content&view=article&Itemid=63&id=50&generate=yes&orient=45&size=96&env=gaussian&std=12&freq=2.2&phase=0&red0=128&green0=128&blue0=128&red1=255&green1=255&blue1=255&red2=0&green2=0&blue2=0
// improve contrast range once tech is available: https://www.w3.org/TR/css-color-4/#predefined    https://darker.ink/writings/Towards-richer-colors-on-the-Web     https://css-tricks.com/the-expanding-gamut-of-color-on-the-web/ 
