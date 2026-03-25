let currentUUID = null;

async function sendOTP() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorMessage = document.getElementById("error-message");

    errorMessage.textContent = "";

    if (!username || !password) {
        errorMessage.textContent = "Username and password cannot be empty!";
        return;
    }

    try {
        const loginBody = [
            { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616" },
            { username: username, password: password }
        ];

        const response = await fetch("https://live.api.smartrpdai.com/api/smartrpd/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginBody)
        });

        const data = await response.json();

        if (response.ok && data.successful && data.uuid) {
            currentUUID = data.uuid;

            // 本地存储基础用户信息，但不跳转
            const userInfo = {
                uuid: currentUUID,
                username: username,
                email: data.email,
                isAdmin: data.isAdmin
            };
            localStorage.setItem("loggedInUser", JSON.stringify(userInfo));

            // 调用 OTP 生成
            const otpRes = await fetch("https://live.api.smartrpdai.com/api/smartrpd/otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([
                    { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616", uuid: currentUUID }
                ])
            });

            if (!otpRes.ok) {
                errorMessage.textContent = "Login succeeded but OTP generation failed.";
                return;
            }

            errorMessage.textContent = "OTP sent. Please check your email.";

        } else {
            errorMessage.textContent = "Login failed. Please check your username and password.";
        }

    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = "An error occurred. Please try again later.";
    }
}

async function verifyAndLogin() {
    const otp = document.getElementById("otp").value.trim();
    const errorMessage = document.getElementById("error-message");

    errorMessage.textContent = "";

    if (!otp) {
        errorMessage.textContent = "Please enter the OTP.";
        return;
    }

    if (!currentUUID) {
        // fallback 从 localStorage 拿
        const stored = localStorage.getItem("loggedInUser");
        if (stored) {
            const user = JSON.parse(stored);
            currentUUID = user.uuid;
        }
    }

    if (!currentUUID) {
        errorMessage.textContent = "Missing UUID. Please send OTP again.";
        return;
    }

    try {
        const verifyBody = [
            { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616", uuid: currentUUID },
            { uuid: currentUUID, otp: otp }
        ];

        const response = await fetch("https://live.api.smartrpdai.com/api/smartrpd/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(verifyBody)
        });

        const data = await response.json();

        if (response.ok && data.successful) {
            window.location.href = "./src/pages/case_list.html";
        } else {
            errorMessage.textContent = "Invalid or expired OTP.";
        }

    } catch (error) {
        console.error("OTP verification error:", error);
        errorMessage.textContent = "OTP verification failed. Please try again.";
    }
}



// Uncomment the code below this line and comment out all the code above this line to disable the OTP feature


// async function login() {
//     const username = document.getElementById("username").value;
//     const password = document.getElementById("password").value;
//     const errorMessage = document.getElementById("error-message");

   
//     errorMessage.textContent = "";

   
//     if (!username || !password) {
//         errorMessage.textContent = "Username and password cannot be empty!";
//         return;
//     }

//     try {
      
//         const requestBody = [
//             { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616" }, 
//             { username: username, password: password }
//         ];
//         const response = await fetch("https://live.api.smartrpdai.com/api/smartrpd/user/login", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify(requestBody)
//         });

//         const data = await response.json();

//         if (response.ok && data.successful) {
//             const userInfo = {
//                 uuid: data.uuid,
//                 username: username, 
//                 email: data.email,
//                 isAdmin: data.isAdmin
//             };
//             localStorage.setItem("loggedInUser", JSON.stringify(userInfo));
//             window.location.href = "./src/pages/case_list.html";
//         } else {
//             errorMessage.textContent = "Login failed. Please check your username and password.";
//         }
//     } catch (error) {
//         console.error("Login error:", error);
//         errorMessage.textContent = "An error occurred. Please try again later.";
//     }
// }