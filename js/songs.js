export const songs = [


    {
	id:1,
        title: "Amazing Grace",
        artist: "John Newton",
        key: "G",
        category: "Hymn",
        language: "English",
        file: "songs/amazing-grace.html"
    },

    {
	id:2,
        title: "I Love This Family",
        artist: "JFCM",
        key: "A",
        category: "Worship",
        language: "English",
        file: "songs/ilovethisfamily.html"
	
	    },

    {
        id:3,
	title: "My Life is in You Lord",
        artist: "Joseph Garlington",
        key: "G",
        category: "Praise",
        language: "English",
        file: "songs/mylifeisinyoulord.html"
    },

    {
	id:4,
        title: "Holy, Holy, Holy",
        artist: "Reginald Heber",
        key: "G",
        category: "Hymn",
        language: "English",
        file: "songs/holy-holy-holy.html"
    },
{
id:5,
        title: "Blessed be the Name of the Lord",
        artist: "Don Moen",
        key: "G",
        category: "Praise",
        language: "English",
        file: "songs/blessedbethename.html"
    },
{
id:6,
        title: "Beautiful Saviour",
        artist: "Planet Shaker",
        key: "G",
        category: "Worship",
        language: "English",
        file: "songs/beautifulsaviour.html"
    },
{
	id:7,
        title: "How Great is Our God",
        artist: "Chris Tomlin",
        key: "G",
        category: "Worship",
        language: "English",
        file: "songs/howgreatisourgod.html"
    },
{
id:8,        
title: "Freely Forgiven",
        artist: "New Church Creation",
        key: "G",
        category: "Worship",
        language: "English",
        file: "songs/freelyforgiven.html"
    },
{
id:9,        
title: "Tinapay ng Buhay",
        artist: "Bukas Palad Music Ministry",
        key: "D",
        category: "Worship",
        language: "Tagalog",
        file: "songs/tinapayngbuhay.html"
    },
{
id:10,        
title: "Give Thanks",
        artist: "Don Moen",
        key: "D",
        category: "Worship",
        language: "English",
        file: "songs/givethanks.html"
    },
{
id:11,        
title: "Worthy is the Lamb",
        artist: "Hillsong Worship",
        key: "D",
        category: "Worship",
        language: "English",
        file: "songs/worthyisthelamb.html"
    },
{
id:12,        
title: "It's Your Blood",
        artist: "Rodrigo Silva",
        key: "G",
        category: "Worship",
        language: "English",
        file: "songs/itsyourblood.html"
    },
{
id:13,        
title: "For the Lord is my Tower",
        artist: "Misc Praise Songs",
        key: "G",
        category: "Worship",
        language: "English",
        file: "songs/forthelordismytower.html"
    },
{
id:14,        
title: "Sama Samang Nagpupuri",
        artist: "Musikatha",
        key: "A",
        category: "Praise",
        language: "Tagalog",
        file: "songs/samasamangnagpupuri.html"
    },
{
id:15,        
title: "Awiting May Galak",
        artist: "Faith Music Manila",
        key: "E",
        category: "Praise",
        language: "Tagalog",
        file: "songs/awitingmaygalak.html"
    },
{
id:16,        
title: "Sumigaw sa Galak",
        artist: "Musikatha",
        key: "E",
        category: "Praise",
        language: "Tagalog",
        file: "songs/sumigawsagalak.html"
    },
{id:17,        
title: "Sukdulang Biyaya",
        artist: "Musikatha",
        key: "D",
        category: "Worship",
        language: "Tagalog",
        file: "songs/sukdulangbiyaya.html"
    },
{id:18,        
title: "Napakabuti Mo",
        artist: "Rommel Guevara",
        key: "G",
        category: "Worship",
        language: "Tagalog",
        file: "songs/napakabutimo.html"
    },
{id:19,        
title: "O Kay Saya at Kay Ganda",
        artist: "Misc Praise Songs",
        key: "A",
        category: "Praise",
        language: "Tagalog",
        file: "songs/okaysayaatkayganda.html"
    }
];
songs.sort((a, b) =>
    a.title.localeCompare(b.title)
);
