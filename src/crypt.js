// Performs symmetric encryption and decryption for case IDs used in URLs.
// The function `lol(input)` will automatically encrypt if given a number (e.g. case ID),
// and decrypt if given an encrypted string (e.g. from URL parameter).

// XOR-based encryption with base64 + noise padding for obfuscation

function xorEncrypt(text, key) {
    // Encrypts plain text by XORing with a key and encoding to base64
    let encryptedBytes = [];
    for (let i = 0; i < text.length; i++) {
        encryptedBytes.push(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    let base64 = btoa(String.fromCharCode(...encryptedBytes));
    // Convert to URL-safe base64
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function xorDecrypt(encryptedBase64, key) {
    // Reverts URL-safe base64 to standard base64
    encryptedBase64 = encryptedBase64.replace(/-/g, '+').replace(/_/g, '/');
    let encryptedText = atob(encryptedBase64);
    let decryptedText = '';
    for (let i = 0; i < encryptedText.length; i++) {
        decryptedText += String.fromCharCode(encryptedText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decryptedText;
}

// Main interface: auto encrypt or decrypt based on input type
function lol(things) {
    const key = "PgrJrkwpeG9pd"; // Shared key used for XOR

    if (!isNaN(things)) {
        // Encrypting numeric case ID
        const encoded = btoa(things.toString());           // Convert number to base64
        const withNoise = `he3dkf${encoded}isj3fk`;         // Add prefix/suffix noise
        return xorEncrypt(withNoise, key);                 // Final encryption + base64
    } else {
        // Decrypting back from URL-safe encrypted string
        const decrypted = xorDecrypt(things, key);                  // XOR decryption
        const trimmed = decrypted.slice(6, -6);                     // Remove noise
        return parseInt(atob(trimmed), 10);                         // Decode to number
    }
}

export { lol };
