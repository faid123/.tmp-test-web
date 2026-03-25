// script2.js

document.addEventListener("DOMContentLoaded", function() {
    // Create the loading bar container
    const loadingBar = document.createElement('div');
    loadingBar.className = 'loading-bar';

    // Create the loading progress bar
    const loadingProgress = document.createElement('div');
    loadingProgress.className = 'loading-progress';

    // Append the loading progress bar to the loading bar container
    loadingBar.appendChild(loadingProgress);

    // Append the loading bar container to the specified element in the DOM
    const loadingContainer = document.getElementById('loading-container');
    loadingContainer.appendChild(loadingBar);

    // Function to check and remove the loading bar
    function removeLoadingBar() {
        // Check if loadingBar is a child of loadingContainer
        if (loadingBar && loadingContainer.contains(loadingBar)) {
            // Turn off the loading bar by removing it from the DOM
            loadingContainer.removeChild(loadingBar);
        }
    }

    // Check the value of the variable from script1.js
    setInterval(function() {
        if (finished) {
            removeLoadingBar();
        }
    }, 500); // Check every second
});
