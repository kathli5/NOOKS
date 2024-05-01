"use strict";

var g;

function nextIfOk(resp) {
    g = resp;
    console.log('response received');
    if (resp.status === 200) {
        return resp.json();
    } else {
        throw new Error('Something went wrong on server!');
    }
}

function loginAjax() {
    let uid = $('[name=uid]').val();
    let form = document.getElementById('login_form');
    console.log('form', form);
    let form_data = new FormData(form);
    console.log('data', form_data);
    const req = new Request('/set-uid-ajax/', {
        method: 'POST',
        body: form_data
    });
    fetch(req)
        .then(nextIfOk)
        .then((resp) => {
            console.debug(resp);
            // update page for logged-in user
            $("#login-uid").text(uid);
            $("#logged-in").show();
            $("#not-logged-in").hide();
        })
        .catch((error) => { console.error(error); });
}

$("#login-ajax").click(loginAjax);

console.log('main.js loaded');

/**
 * On click, derives the nook from the like button class,
 * calls likeNook(nid) to use ajax to like Nook
 */
$(document).ready(() => {
    $('.likebutton').click((e) => {
        let nid = $(e.currentTarget).attr("class").split(/\s+/)[1];
        console.log(nid);
        likeNook(nid);
    })

    /**
     * Takes a nook id and uses ajax to retrieve information on whether the user has or hasn't liked the nook.
     * Then updates the nook list page accordingly. 
     * @param nid ID of the nook being updated
     */
    function likeNook(nid) {
        $.post("/like/" + nid, { nid: nid }).then((res) => {
            if (res.change) {
                //switch the like heart to be filled
                $(`.${nid}`).html(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-heart-fill" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314"/>
          </svg>`)
          console.log($(`.${nid}`).prev())
          $(`.${nid}`).prev().text(res.likes);
            } else {
                //switch the like heart to be unfilled
                $(`.${nid}`).html(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-heart" viewBox="0 0 16 16">
            <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"/>
          </svg>`)
          $(`.${nid}`).prev().text(res.likes)
            }
        });
    }
})