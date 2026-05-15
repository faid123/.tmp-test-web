async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorMessage = document.getElementById("error-message");

    errorMessage.textContent = "";

    if (!username || !password) {
        errorMessage.textContent = "Username and password cannot be empty!";
        return;
    }

    try {
        const requestBody = [
            { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616" },
            { username: username, password: password }
        ];

        const response = await fetch("https://live.api.smartrpdai.com/api/smartrpd/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok && data.successful) {
            const userInfo = {
                uuid: data.uuid,
                username: username,
                email: data.email,
                isAdmin: data.isAdmin
            };
            localStorage.setItem("loggedInUser", JSON.stringify(userInfo));
            window.location.href = "./src/pages/case_list.html";
        } else {
            errorMessage.textContent = "Login failed. Please check your username and password.";
        }
    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = "An error occurred. Please try again later.";
    }
}

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("error-message");

    errorMessage.textContent = "";

    if (!username || !password) {
        errorMessage.textContent = "Username and password cannot be empty!";
        return;
    }

    try {
        const requestBody = [
            { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616" },
            { username: username, password: password }
        ];
        const response = await fetch("https://live.api.smartrpdai.com/api/smartrpd/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok && data.successful) {
            const userInfo = {
                uuid: data.uuid,
                username: username,
                email: data.email,
                isAdmin: data.isAdmin
            };
            localStorage.setItem("loggedInUser", JSON.stringify(userInfo));
            window.location.href = "./src/pages/case_list.html";
        } else {
            errorMessage.textContent = "Login failed. Please check your username and password.";
        }
    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = "An error occurred. Please try again later.";
    }
}
