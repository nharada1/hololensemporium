/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *          http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Initializes FriendlyChat.
function FriendlyChat() {
    this.checkSetup();

    // Shortcuts to DOM Elements.
    this.messageList = document.getElementById('messages');
    this.messageForm = document.getElementById('message-form');
    this.messageInput = document.getElementById('message');
    this.submitButton = document.getElementById('submit');
    this.submitImageButton = document.getElementById('submitImage');
    this.imageForm = document.getElementById('image-form');
    this.mediaCapture = document.getElementById('mediaCapture');
    this.userPic = document.getElementById('user-pic');
    this.userName = document.getElementById('user-name');
    this.signInButton = document.getElementById('sign-in');
    this.signOutButton = document.getElementById('sign-out');
    this.signInSnackbar = document.getElementById('must-signin-snackbar');
    this.totalCost = document.getElementById('total');
    this.thankYou = document.getElementById('thank-you');

    // Saves message on form submit.
    this.messageForm.addEventListener('submit', this.saveMessage.bind(this));
    this.signOutButton.addEventListener('click', this.signOut.bind(this));
    this.signInButton.addEventListener('click', this.signIn.bind(this));

    // Toggle for the button.
    var buttonTogglingHandler = this.toggleButton.bind(this);
    this.messageInput.addEventListener('keyup', buttonTogglingHandler);
    this.messageInput.addEventListener('change', buttonTogglingHandler);

    // Events for image upload.
    this.submitImageButton.addEventListener('click', function() {
        this.mediaCapture.click();
        this.submitImageButton.setAttribute('class', 'mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect mdl-color--blue mdl-color-text--white')
    }.bind(this));

    this.initFirebase();
}

// Sets up shortcuts to Firebase features and initiate firebase auth.
FriendlyChat.prototype.initFirebase = function() {
        // Shortcuts to Firebase SDK features.
        this.auth = firebase.auth();
        this.database = firebase.database();
        this.storage = firebase.storage();
        // Initiates Firebase auth and listen to auth state changes.
        this.auth.onAuthStateChanged(this.onAuthStateChanged.bind(this));
};


// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadTotal = function() {
    var uid = this.auth.currentUser.uid;
    // Reference to the /messages/ database path.
    this.messagesRef = this.database.ref(uid);

    var that = this;
    this.messagesRef.on('value', function(snapshot) {
        var snap = snapshot.val();
        var sum = 0;
        for (var key in snap) {
            sum += snap[key].cost*snap[key].count;
        }
        that.totalCost.innerHTML = 'Total&nbsp<div style="color:green">$'+sum.toString()+'</div>';
    });
};

// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadThankYou = function() {
    var uid = this.auth.currentUser.uid;
    // Reference to the /messages/ database path.
    this.messagesRef = this.database.ref(uid);

    var that = this;
    this.messagesRef.on('value', function(snapshot) {
        var sums = {};
        var snap = snapshot.val();
        for (var key in snap) {
            var vendor = snap[key].vendor;
            if (!sums[vendor]) {
                sums[vendor] = 0;
            }
            var sum = snap[key].cost*snap[key].count;
            console.log(vendor, sum, snap[key]);
            sums[vendor] += sum;
        }
        for (var vendor in sums) {
            console.log(sums[vendor])
            that.displayThankYouMessage(vendor, sums[vendor]);
        }
        console.log(sums);
    });
};


// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadMessages = function() {
    var uid = this.auth.currentUser.uid;
    // Reference to the /messages/ database path.
    this.messagesRef = this.database.ref(uid);
    // Make sure we remove all previous listeners.
    this.messagesRef.off();

    // Loads the last 12 messages and listen for new ones.
    var setMessage = function(data) {
        var val = data.val();
        this.displayMessage(data.key, val.modelUrl, val.text, val.photoUrl, val.imageUrl, val.count, val.vendor, val.cost);
    }.bind(this);
    this.messagesRef.limitToLast(12).on('child_added', setMessage);
    this.messagesRef.limitToLast(12).on('child_changed', setMessage);
};

// Saves a new message on the Firebase DB.
FriendlyChat.prototype.saveMessage = function(e) {
    e.preventDefault();
    var file = e.target[0].files[0];

    // Check if the file is an image.
    var fileSuff = file.name.split('.').pop();
    if (fileSuff !== "FBX") {
        var data = {
            message: "Filetype not recognized, please use FBX files",
            timeout: 2000
        };
        this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
        return;
    }
    // Check if the user is signed-in
    if (this.checkSignedInWithMessage()) {
        // We add a message with a loading icon that will get updated with the shared image.
        var currentUser = this.auth.currentUser;
        this.messagesRef.push({
            name: currentUser.displayName,
            text: this.messageInput.value,
            modelUrl: 'Please wait ... uploading your model file',
            photoUrl: currentUser.photoURL || '/images/profile_placeholder.png'
        }).then(function(data) {
            // Clear the selection in the file picker input.
            this.imageForm.reset();
            this.messageForm.reset();
            this.submitImageButton.setAttribute('class', 'mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect mdl-color--amber-400 mdl-color-text--white')
            // Reset the message and retoggle
            FriendlyChat.resetMaterialTextfield(this.messageInput);
            this.toggleButton();
            // Upload the file to Firebase Storage.
            this.storage.ref(currentUser.uid + '/' + Date.now() + '/' + file.name)
                .put(file, {contentType: file.type})
                .then(function(snapshot) {
                    // Get the file's Storage URI and update the chat message placeholder.
                    var filePath = snapshot.metadata.fullPath;
                    this.storage.ref(filePath).getDownloadURL()
                        .then(function(url) {
                            data.update({modelUrl: url});
                        })
                }.bind(this)).catch(function(error) {
                console.error('There was an error uploading a file to Firebase Storage:', error);
            });
        }.bind(this));
    }
};

// Sets the URL of the given img element with the URL of the image stored in Firebase Storage.
FriendlyChat.prototype.setImageUrl = function(imageUri, imgElement) {
    imgElement.src = imageUri;

    // TODO(DEVELOPER): If image is on Firebase Storage, fetch image URL and set img element's src.
};

// Signs-in Friendly Chat.
FriendlyChat.prototype.signIn = function() {
    // Sign in Firebase using popup auth and Google as the identity provider.
    var provider = new firebase.auth.GoogleAuthProvider();
    this.auth.signInWithPopup(provider);
};

// Signs-out of Friendly Chat.
FriendlyChat.prototype.signOut = function() {
    // Sign out of Firebase.
    this.auth.signOut();
};

// Triggers when the auth state change for instance when the user signs-in or signs-out.
FriendlyChat.prototype.onAuthStateChanged = function(user) {
    if (user) { // User is signed in!
        // Get profile pic and user's name from the Firebase user object.
        var profilePicUrl = user.photoURL;
        var userName = user.displayName;

        // Set the user's profile pic and name.
        this.userPic.style.backgroundImage = 'url(' + profilePicUrl + ')';
        this.userName.textContent = userName;

        // Show user's profile and sign-out button.
        this.userName.removeAttribute('hidden');
        this.userPic.removeAttribute('hidden');
        this.signOutButton.removeAttribute('hidden');

        // Hide sign-in button.
        this.signInButton.setAttribute('hidden', 'true');

        // We load currently existing chant messages.
        this.loadMessages();
        this.loadTotal();
        this.loadThankYou();

    } else { // User is signed out!
        // Hide user's profile and sign-out button.
        this.userName.setAttribute('hidden', 'true');
        this.userPic.setAttribute('hidden', 'true');
        this.signOutButton.setAttribute('hidden', 'true');

        // Show sign-in button.
        this.signInButton.removeAttribute('hidden');
    }
};

// Returns true if user is signed-in. Otherwise false and displays a message.
FriendlyChat.prototype.checkSignedInWithMessage = function() {
    if (this.auth.currentUser) {
        return true;
    }

    // Display a message to the user using a Toast.
    var data = {
        message: 'You must sign-in first',
        timeout: 2000
    };
    this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
    return false;
};

// Resets the given MaterialTextField.
FriendlyChat.resetMaterialTextfield = function(element) {
    element.value = '';
    element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
};

// Template for messages.
FriendlyChat.MESSAGE_TEMPLATE =
        '<div class="message-container">' +
            '<div class="spacing"><div class="pic"></div></div>' +
            '<div class="count"></div>' +
            '<div class="plus"><i class="material-icons">add</i></div>' +
            '<div class="minus"><i class="material-icons">remove</i></div>' +
            '<div class="message"></div>' +
            '<div class="cost"></div>' +
            '<div class="vendor"></div>' +
        '</div>';

FriendlyChat.THANK =
        '<div class="thank-container">' +
            '<div class="thankspacing"></div>' +
            '<div class="thankmessage"></div>' +
            '<div class="thanktotaleach"></div>' +
        '</div>';


// A loading image URL.
FriendlyChat.LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif';

// Add one
FriendlyChat.prototype.add = function(key) {
    var div = document.getElementById(key);
    var cnt;
    // div.querySelector('.count').textContent = cnt.toString()

    // Check if the user is signed-in
    if (this.checkSignedInWithMessage()) {
        // We add a message with a loading icon that will get updated with the shared image.
        var currentUser = this.auth.currentUser;
        var that = this;
        return this.database.ref(currentUser.uid + '/' + key).once('value').then(function(snapshot) {
            cnt = snapshot.val().count;
            cnt += 1;
            that.database.ref(currentUser.uid + '/' + key + '/count').set(cnt);
        })
    }
}

// Remove one
FriendlyChat.prototype.remove = function(key) {
    var div = document.getElementById(key);
    var cnt;
    // div.querySelector('.count').textContent = cnt.toString()

    // Check if the user is signed-in
    if (this.checkSignedInWithMessage()) {
        // We add a message with a loading icon that will get updated with the shared image.
        var currentUser = this.auth.currentUser;
        var that = this;
        return this.database.ref(currentUser.uid + '/' + key).once('value').then(function(snapshot) {
            cnt = snapshot.val().count;
            if (cnt > 0) {
                cnt -= 1;
            }
            that.database.ref(currentUser.uid + '/' + key + '/count').set(cnt);
        })
    }
}


// Displays a Message in the UI.
FriendlyChat.prototype.displayThankYouMessage = function(vendor, total) {
    var div = document.getElementById(vendor);
    // If an element for that message does not exists yet we create it.
    if (!div) {
        var container = document.createElement('div');
        container.innerHTML = FriendlyChat.THANK;
        div = container.firstChild;
        div.setAttribute('id', vendor);
        this.thankYou.appendChild(div);
    }
    div.querySelector('.thanktotaleach').textContent = total;

    var messageElement = div.querySelector('.thankmessage');
    messageElement.textContent = vendor;
    // Replace all line breaks by <br>.
    messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
    // Show the card fading-in.
    setTimeout(function() {div.classList.add('visible')}, 1);
    this.messageList.scrollTop = this.messageList.scrollHeight;
    this.messageInput.focus();
};


// Displays a Message in the UI.
var remove_bound = {};
var add_bound = {};
FriendlyChat.prototype.displayMessage = function(key, modelUrl, text, picUrl, imageUri, count, vendor, cost) {
    var div = document.getElementById(key);
    // If an element for that message does not exists yet we create it.
    if (!div) {
        var container = document.createElement('div');
        container.innerHTML = FriendlyChat.MESSAGE_TEMPLATE;
        div = container.firstChild;
        div.setAttribute('id', key);
        this.messageList.appendChild(div);
    }
    if (picUrl) {
        div.querySelector('.pic').style.backgroundImage = 'url(' + picUrl + ')';
    }
    div.querySelector('.count').textContent = count;
    div.querySelector('.vendor').textContent = vendor+", $"+cost.toString()+" each";
    div.querySelector('.cost').textContent = cost*count;

    div.querySelector('.plus').setAttribute("id", "plus_"+key)
    var obj = document.getElementById("plus_"+key);
    if (!add_bound[key]) {
        obj.addEventListener('click', this.add.bind(this, key));
        add_bound[key] = true;
    }
    div.querySelector('.minus').setAttribute("id", "minus_"+key)
    var obj = document.getElementById("minus_"+key);
    if (!remove_bound[key]) {
        obj.addEventListener('click', this.remove.bind(this, key));
        remove_bound[key] = true;
    }

    div.querySelector('.minus').setAttribute("onclick", "FriendlyChat.prototype.remove('"+key+"')")
    var messageElement = div.querySelector('.message');
    if (text) { // If the message is text.
        messageElement.textContent = text;
        // Replace all line breaks by <br>.
        messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
    } else if (imageUri) { // If the message is an image.
        var image = document.createElement('img');
        image.addEventListener('load', function() {
            this.messageList.scrollTop = this.messageList.scrollHeight;
        }.bind(this));
        this.setImageUrl(imageUri, image);
        messageElement.innerHTML = '';
        messageElement.appendChild(image);
    }
    // Show the card fading-in.
    setTimeout(function() {div.classList.add('visible')}, 1);
    this.messageList.scrollTop = this.messageList.scrollHeight;
    this.messageInput.focus();
};

// Enables or disables the submit button depending on the values of the input
// fields.
FriendlyChat.prototype.toggleButton = function() {
    if (this.messageInput.value && this.mediaCapture.files.length==1) {
        this.submitButton.removeAttribute('disabled');
    } else {
        this.submitButton.setAttribute('disabled', 'true');
    }
};

// Checks that the Firebase SDK has been correctly setup and configured.
FriendlyChat.prototype.checkSetup = function() {
    if (!window.firebase || !(firebase.app instanceof Function) || !window.config) {
        window.alert('You have not configured and imported the Firebase SDK. ' +
                'Make sure you go through the codelab setup instructions.');
    } else if (config.storageBucket === '') {
        window.alert('Your Firebase Storage bucket has not been enabled. Sorry about that. This is ' +
                'actually a Firebase bug that occurs rarely. ' +
                'Please go and re-generate the Firebase initialisation snippet (step 4 of the codelab) ' +
                'and make sure the storageBucket attribute is not empty. ' +
                'You may also need to visit the Storage tab and paste the name of your bucket which is ' +
                'displayed there.');
    }
};

window.onload = function() {
    window.friendlyChat = new FriendlyChat();
};
