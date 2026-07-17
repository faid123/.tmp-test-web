(function () {
    const user = JSON.parse(localStorage.getItem("loggedInUser"));

    if (!user || !user.uuid) {
        window.location.href = "../pages/login.html";  
    }
})();
