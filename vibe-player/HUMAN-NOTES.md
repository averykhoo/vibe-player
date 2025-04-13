# notes by the human

llm pls don't edit thanks
(but feel free to read)

## todo

* Hide VAD tuning or add a graph to show the probs, start and stop thresholds, and color that too but faded?
* more player controls? maybe up and down to change speed by 0.25? enter also to play/pause? make the keybinds modifiable? and savable in local storage? and a reset button too if so
* add a 'back to start' button near play/pause and a 'reset' button to controls / vad controls
* play in reverse button

## things i noticed

* ~~gemini gets kinda laggy past 400k tokens~~
    * fixed recently somehow, i think they fixed a browser side caching problem in the aistudio app
* chatgpt does not do well at refactoring a multi-file codebase - to the point i've given up on it after the codebase grew to about 4 files
* the first prompt should always ask it to read the contrib guide and familiarize itself with the codebase
* it also seems to help to remind it to mentally run through the contrib guide one more time right before code gen
  * you really really gotta do this, it gets lazy otherwise. ask it to recite the key/relevant parts of contrib guide before it starts

* back to start button?
* play in reverse / rewind / reverse jog? button that you hold down to play at negative of your current speed
