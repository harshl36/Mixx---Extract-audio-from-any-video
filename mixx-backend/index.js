const cors = require('cors');
require('dotenv').config();
const morgan = require("morgan");
const upload = require('./middlewares/multer');
const Project = require('./models/project');
const User = require('./models/user');
const { extractAudioFromFile, downloadVideoFromUrl } = require('./controllers/extract_audio');
const uploadFileToBucket = require('./controllers/storageBucket');
const PORT = process.env.PORT || 5000;

// setting up the server
const express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io')(server, {
        cors: {
            origin: '*'
        }
    });
// setting middlewares
    app.use(cors({
        origin: '*',
    }));
    app.use(express.json());
    
server.listen(PORT, () => console.log("Server running at PORT " + PORT));

// setting up the mongodb database
const mongoose = require('mongoose');
mongoose.set("strictQuery", true);
mongoose
    .connect(process.env.CONNECTION_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log('DB connected'))
    .catch((err) => console.log(err));

const authRouter = require('./routes/auth.js');
const projectRouter = require('./routes/project/createProject.js');
const { deleteProjectRouter } = require('./routes/project/deleteProject');
const CTTRouter = require('./routes/project/addCommentAndTime');
const getAllProjectsRouter = require('./routes/project/getAllProjects');
const getAllCTTRouter = require('./routes/project/getAllCTT');

app.post('/upload-url', async (req, res) => {
    const videoUrl = req.body.videoUrl;
    const audioFormat = req.body.audioFormat;
    const userId = req.body.userId;

    try {
        const videoPath = await downloadVideoFromUrl(videoUrl)
        const filePath = await extractAudioFromFile(videoPath.split('/').pop(), audioFormat)
        const url = await uploadFileToBucket(filePath, audioFormat);

        const newProject = new Project({
            name: videoPath.split('/').pop(),
            audioURL: url,
            audioFormat: audioFormat,
            user: userId
        })
        await newProject.save().then(async (project) => {
            await User.findOne({ _id: userId }).then(user => {
                user.savedProjects.push(project);
                user.save();
            })
            res.status(200).json(project);
        })
            .catch(err => {
                res.status(500).json({ error: err });
            });
    } catch (error) {
        res.status(500).json('The URL Format is not supported!')
    }
})


app.post('/upload-file', upload, async (req, res) => {
    // specify the output format here
    const audioFormat = req.body.audioFormat;

    try {
        const name = req.file.filename
        const filePath = await extractAudioFromFile(req.file.filename, audioFormat)
        const url = await uploadFileToBucket(filePath, audioFormat);
        const userId = req.body.userId;
        const newProject = new Project({
            name,
            audioFormat,
            audioURL: url,
            user: userId
        });
        await newProject.save()
            .then(async (project) => {
                await User.findOne({ _id: userId }).then(user => {
                    user.savedProjects.push(project);
                    user.save();
                })
                res.status(200).json(project);
            })
            .catch(err => {
                res.status(500).json({ error: err });
            });
    } catch (error) {
        res.status(500).json(error + " error index file")
    }
})

app.use('/auth', authRouter);
app.use('/project', projectRouter);
app.use('/project', deleteProjectRouter);
app.use('/project', CTTRouter)
app.use('/project', getAllProjectsRouter)
app.use('/project', getAllCTTRouter)


if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}