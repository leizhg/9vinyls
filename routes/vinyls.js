const fetch = require('node-fetch'); // Make sure node-fetch is installed
const express = require('express');
const Vinyl = require('../models/vinyl'); // Path to your Vinyl model
const QueryLog = require('../models/queryLog');
const router = express.Router();
//require('dotenv').config();
const {OpenAI } = require("openai");
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } = require("@google/generative-ai");
  
const GOOGLE_MODEL_NAME = "gemini-pro";
const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

router.post('/vinyls', async (req, res) => {
    console.log('routes/vinyls: post')
    try {
        const vinyl = new Vinyl({
            title: req.body.title
         //   artist: req.body.artist,
         //   genre: req.body.genre,
         //   coverImage: req.body.coverImage
        });
        //await vinyl.save();
        const curator = req.body.curator; 
        const prompt = req.body.prompt;
        const vinyls  = await getSimilarVinyls(req.body.title, curator, prompt);

        res.status(200).send(vinyls);

        //res.render('index', {vinyls})
    } catch (error) {
        res.status(400).send(error);
        console.log(error)
    }
});

async function getSimilarVinyls(title, curator, prompt) {
    console.log('getSimilarVinyls for title: '+title +' by curator: '+curator + ' prompt: '+prompt)
    // Step 1: Use Google or OpenAI API to get recommendations based on the title
    let recommendedTitles;

    if (curator === 'openai') {
        recommendedTitles = await getRecommendationsFromOpenAI(title, prompt);
    }else{
        recommendedTitles = await getRecommendationsFromGoogleGemini(title, prompt);
    }   
    console.log('recommendedTitles.Records'+recommendedTitles.Records)

    // Step 2: For each recommended title, fetch the cover image using iTunes Search API
    const vinylsWithCovers = await Promise.all(recommendedTitles.Records.map(async (record) => {
    const coverImage = await getCoverImageFromiTunes(record.Title+' by '+record.Artist);
    //coverImage = getCoverImageFromMusicBrainz(record.Title, record.Artist);

        console.log(coverImage);
        return new Vinyl({
            title: record.Title,
            artist: record.Artist, // You may need additional logic to find the artist
            genre: '', // Genre might also need to be fetched or predefined
            coverImage: coverImage,
            recommendationReason: record.Explanation // Reason for recommendation
        });
    }));

    const originalRecordCover = await getCoverImageFromiTunes(title);

    vinylsWithCovers.unshift(new Vinyl({
        title: title,
        artist: '', // You may need additional logic to find the artist
        genre: '', // Genre might also need to be fetched or predefined
        coverImage: originalRecordCover,
        recommendationReason: "You entered this." 
    }));

    return vinylsWithCovers;
}

async function getRecommendationsFromOpenAI(title, prompt) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    let retry_count =0;
    while(true){
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                {
                    "role": "system",
                    "content": prompt
                },
                {
                    "role": "user",
                    "content": `Now recommend 8 vinyl records based on "${title}"`
                }
                ],
                temperature: 1,
                max_tokens: 1000,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });
            //console.log('response choice length: '+response.choices.length); 
            console.log('response message content: '+response.choices[0].message.content); 
            logQuery('OpenAI', prompt, title, response.choices[0].message.content);

            if (response.choices && response.choices.length > 0) {
                const recommendations = response.choices[0].message.content;
                //console.log('recommendations: '+recommendations)
                // Assuming the recommendations are in the expected JSON format
                return JSON.parse(recommendations);
            } else {
                return []; // No recommendations found
            }    
        } catch (error) {
            console.error('Retry count ('+retry_count+') Error in OpenAI API call:', error);
            retry_count++;
            if (retry_count>2)
                return [];
        }
    }
}



async function getRecommendationsFromGoogleGemini(title, prompt) {
    let retry_count =0;
    while(true){
        try {
            const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: GOOGLE_MODEL_NAME });
        
            const generationConfig = {
            temperature: 1,
            topK: 50,
            topP: 1,
            maxOutputTokens: 1000,
            };
        
            const safetySettings = [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            ];
        
            const parts = [
            {text: prompt+" Now recommend 8 vinyl records based on "+title},
            ];
        
            const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
            });
        
            const response = result.response;
            console.log(response.text()); 
            logQuery('Google', prompt, title, response.text());

            return JSON.parse(response.text());

        } catch (error) {
            console.error('Retry count: ('+retry_count+') Error in Google Gemini API call:', error);
            retry_count++;
            if (retry_count>2)
                return [];
        }
    }
}

async function getCoverImageFromMusicBrainz(albumTitle, artist) {
    // Helper function to perform a fetch request
    async function fetchData(url) {
        const response = await fetch(url);
     //   console.log(url);
     //   console.log(response);
        return response.json();
    }

    async function fetchCover(url) {
        const response = await fetch(url);
        console.log(url);
        console.log(response);
        return response.json();
    }


    // Step 1: Query MusicBrainz for the MBID
    const mbQueryUrl = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(albumTitle)} AND artist:"${encodeURIComponent(artist)}"&fmt=json`;
    const mbData = await fetchData(mbQueryUrl);

    const releases = mbData['release-groups'][0]?.releases;
    if (!releases || releases.length === 0) {
        throw new Error('No releases found for this album and artist.');
    }
    const mbid = releases[0].id;
    //console.log(mbQueryUrl);
    //console.log(mbData);
    //console.log('MBID: '+mbid);

    // Step 2: Get the cover art URLs using the MBID
    const coverArtUrl = `http://coverartarchive.org/release/${mbid}`;
    console.log(coverArtUrl);

    const coverArtData = await fetchCover(coverArtUrl);
    console.log(coverArtData);
    console.log('large URL: '+coverArtData.images[0].thumbnails.large);

    // Step 3: Return the URL for the large-sized cover art
    return coverArtData.images[0].thumbnails.large;
}

async function getCoverImageFromiTunes(albumTitle) {
    const searchQuery = `${albumTitle}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=album&limit=1`;
    console.log(url);
    
    let retry_count=0;

    while(true){

        try {
            const response = await fetch(url);
            const data = await response.json();

            // Filter out non-album results and find the first album result
            const albumResult = data.results.find(result => result.wrapperType === 'collection');

            if (albumResult) {
                return albumResult.artworkUrl100; // URL of the album cover
            } else {
                retry_count++;
                if (retry_count>2)
                    return 'img/default-cover.png'; // Fallback image URL
            }
        } catch (error) {
            console.error('Error fetching cover image from iTunes:', error);
            retry_count++;
            if (retry_count>2)
                return 'img/default-cover.png'; // Fallback image URL in case of error
        }
    }
}

async function logQuery(curator, prompt, title, result){

    const newQueryLog = new QueryLog({
        curator: curator,
        prompt: prompt,
        titleEntered: title,
        results: result // Replace with the actual JSON response
    });
    
    try {
        await newQueryLog.save();
        // Continue with your response handling
    } catch (error) {
        console.error('Error saving query log:', error);
        // Handle error
    }
    

}

// Export the router
module.exports = router;
