const express = require("express");
const web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const cors = require('cors')
const axios = require('axios')
require('dotenv').config()
const NFT_CONTRACT_ABI = require('../abi.json')
const bodyParser = require('body-parser')
const fileUpload = require('express-fileupload')
const pinataSDK = require('@pinata/sdk')
const fs = require('fs')

// Init Express App
const port = 3000;
const app = express()
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
    fileUpload({
        limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
        useTempFiles: true
    })
);
app.use(express.json())

// Handle metadata upload
app.post('/upload', async (req, res) => {
    if (process.env.UPLOAD_KEY === undefined) {
        return res.status(500).json({
            error: 'Upload endpoint is not enabled.'
        });
    }
    if (!req.headers.authorization || (req.headers.authorization !== undefined && req.headers.authorization.replace('Bearer ', '') !== process.env.UPLOAD_KEY)) {
        return res.status(401).json({ error: 'Unauthorized request.' });
    }
    // Validating file
    let file
    if (req.files === undefined || (req.files !== undefined && req.files.file === undefined)) {
        return res.status(500).json({
            error: 'No file data found.'
        });
    } else {
        file = req.files.file
    }
    // Validating name
    if (req.body.name === undefined) {
        return res.status(500).json({
            error: 'No name specified.'
        });
    }
    // Validating attributes
    let attributes
    if (req.body.attributes !== undefined) {
        try {
            attributes = JSON.parse(req.body.attributes)
        } catch (e) {
            return res.status(500).json({
                error: 'Attributes are not valid.'
            });
        }
    }
    // Uploading files to IPFS
    try {
        const pinata = pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
        const fileCID = await pinata.pinFileToIPFS(fs.createReadStream(file.tempFilePath));
        const metadata = {
            "description": req.body.description,
            "external_url": req.body.external_url,
            "image": "ipfs://" + fileCID.IpfsHash,
            "attributes": attributes,
            "name": req.body.name
        }
        const metadataCID = await pinata.pinJSONToIPFS(metadata, { pinataMetadata: { name: req.body.name } })
        return res.status(200).json({ metadata: metadata, ipfsHash: metadataCID.IpfsHash })
    } catch (e) {
        console.log(e);
        return res.status(500).json({ error: 'File upload failed, please retry.' });
    }
});

// Handle metadata request
app.get("/nft/:nftId", async function (req, res) {
    try {
        const provider = new HDWalletProvider(
            process.env.DUMMY_MNEMONIC,
            process.env.WEB3_PROVIDER
        );
        const web3Instance = new web3(provider);
        const nftContract = new web3Instance.eth.Contract(
            NFT_CONTRACT_ABI,
            process.env.CONTRACT_ADDRESS
        );
        const tokenCID = await nftContract.methods.tokenCID(req.params.nftId.replace('.json', '')).call()
        if (tokenCID.length > 0) {
            const metadata = await axios.get(process.env.IPFS_GATEWAY + tokenCID)
            res.status(200).json(metadata.data);
        } else {
            res.status(404).json({
                error: "Can't find event."
            });
        }
    } catch (e) {
        console.log(e);
        res.status(500).json({
            error: "Something goes wrong, please retry."
        });
    }
});

app.listen(port, () => {
    console.log(`bridge-api listen at http://localhost:${port}`)
})