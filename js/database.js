
let songDatabase = [];

async function loadDatabase(){

    let songDatabase = [

{
    id:1,
    title:"Amazing Grace",
    artist:"John Newton",
    key:"G",
    genre:"Hymn",
    file:"amazing-grace.html"
},

{
    id:2,
    title:"Way Maker",
    artist:"Sinach",
    key:"E",
    genre:"Worship",
    file:"way-maker.html"
}

];


function loadDatabase(){

    console.log("Songs loaded:", songDatabase.length);

    buildSongGrid(songDatabase);

}


loadDatabase();

    buildSongGrid(songDatabase);

}
loadDatabase();

function searchSongs(keyword){

    keyword = keyword.toLowerCase();

    const result = songDatabase.filter(song=>{

        return (

            song.title.toLowerCase().includes(keyword) ||

            song.artist.toLowerCase().includes(keyword) ||

            song.genre.toLowerCase().includes(keyword) ||

            song.key.toLowerCase().includes(keyword)

        );

    });

    buildSongGrid(result);

}

loadDatabase();

function filterArtist(name){

    const result = songDatabase.filter(song=>song.artist===name);

    buildSongGrid(result);

}
function filterKey(key){

    const result = songDatabase.filter(song=>song.key===key);

    buildSongGrid(result);

}
favorites=[
1,
5,
8,
11
]
recentSongs=[
21,
18,
45,
67,
9
]
function searchSongs(keyword) {

    keyword = keyword.toLowerCase();

    const result = songDatabase.filter(song =>
        song.title.toLowerCase().includes(keyword) ||
        song.artist.toLowerCase().includes(keyword) ||
        song.genre.toLowerCase().includes(keyword)
    );

    buildSongGrid(result);
}