"use strict";

/* =====================================
   USERS
===================================== */

const USERS = [

    {
        username: "carlo",
        password: "1234",
        name: "Carlo"
    },

    {
        username: "admin",
        password: "admin123",
        name: "Administrator"
    }

];


/* =====================================
   LOGIN
===================================== */

const loginForm =
document.getElementById("loginForm");


if(loginForm){

    loginForm.addEventListener(
        "submit",
        function(event){

            event.preventDefault();

            const username =
                document
                .getElementById("username")
                .value
                .trim();

            const password =
                document
                .getElementById("password")
                .value;

            const user =
                USERS.find(function(u){

                    return (
                        u.username === username &&
                        u.password === password
                    );

                });


            if(!user){

                document
                .getElementById("error")
                .textContent =
                "Invalid username or password.";

                return;

            }


            /* SAVE LOGGED-IN USER */

            localStorage.setItem(
                "currentUser",
                JSON.stringify(user)
            );


            /* GO TO DASHBOARD */

            window.location.href =
                "index.html";

        }
    );

}
