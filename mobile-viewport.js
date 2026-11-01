'use strict';
// Preserve one-finger page scrolling while suppressing browser pinch gestures.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
document.addEventListener('dblclick',event=>{if(matchMedia('(pointer: coarse)').matches&&!event.target.closest('input,textarea,select,button,a'))event.preventDefault()},{passive:false});

