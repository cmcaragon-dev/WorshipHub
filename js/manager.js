function displaySongs(){

let html="";


songs.forEach(song=>{


html += `

<div class="song-card">

<h3>${song.title}</h3>

<p>
${song.artist}
</p>

<p>
Key: ${song.key}
</p>

<p>
Genre: ${song.genre}
</p>


<button onclick="deleteSong(${song.id})">
Delete
</button>


</div>


`;

});


document.getElementById("songList").innerHTML=html;


}



function addSong(){


let newSong={

id:Date.now(),

title:
document.getElementById("title").value,

artist:
document.getElementById("artist").value,

key:
document.getElementById("key").value,

genre:
document.getElementById("genre").value

};


songs.push(newSong);


saveSongs();


displaySongs();


}



function deleteSong(id){


songs =
songs.filter(song=>song.id!==id);


saveSongs();


displaySongs();


}



function saveSongs(){

localStorage.setItem(
"worshipSongs",
JSON.stringify(songs)
);

}



function loadSongs(){


let saved =
localStorage.getItem("worshipSongs");


if(saved){

songs =
JSON.parse(saved);

}


displaySongs();


}


loadSongs();