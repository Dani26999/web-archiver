const express = require('express');
const fetch = require('node-fetch');
const cheerio = require ('cheerio');
const stream = require('stream');
const archiver = require('archiver');
const path = require('path');


function getTransformStream(url, recLevel, replaceManager, doCrawlAndDownloadResource) {
  let transformStream = new stream.Transform();
  let buffer='';

  transformStream._transform = function(chunk, encoding, callback) {
    buffer += chunk.toString();
    callback();
  };

  transformStream._flush = function(callback){
    this.push(transformStream._replace(buffer));
    callback();
  }

  transformStream._replace = function(chunk){
      $ = cheerio.load(chunk);
      $('a').each(function (i, link){
        let href = $(this).attr('href');
        let downloadableURL = URLManager.getDownloadableURL(url,href);
        let newhref = replaceManager.lookupName(downloadableURL);
        $(this).attr('href', newhref);

        doCrawlAndDownloadResource(downloadableURL, recLevel - 1, newhref);

      }); //end $a.each
      return $.html();
    };

  return transformStream;
}//end getTransformStream

function URLManager() {
}
URLManager.getResourceExtension = function(uri){
  let url = new URL(uri);
  let extension = path.extname(url.pathname);
  if (extension == "") {
    extension = ".html"
  }
  return extension;
}

URLManager.getDownloadableURL = function(urlParent, href) {
  if(href == undefined) {
    href = "";
  }
  return new URL(href, urlParent);
}

function ReplaceManager(maxFiles) {
  this._fileCounter = 0;
  this._replaceMap = {};

  this.lookupName = function(_url) {
    let nombre;

    if(this._replaceMap[_url] == undefined) {
      if (this._fileCounter < maxFiles) {
        if(this._fileCounter == 0) {
          nombre = "index.html";
        }
        else {
          nombre = this._fileCounter.toString() + URLManager.getResourceExtension(_url);
        }
        this._fileCounter++;
      }
      else {
        nombre = ReplaceManager._NOT_FOUND_FILE;
      }
      this._replaceMap[_url] = nombre;
    }
    else {
      nombre = this._replaceMap[_url];
    }
    return nombre;
  }
}
ReplaceManager._NOT_FOUND_FILE = "404.html";



function startCrawling(req, res){
  let downloadedFiles = [];
  if (req.query.recLevel > 0 && req.query.maxFiles > 0) {
    let replaceManager = new ReplaceManager(req.query.maxFiles);
    let nombre = replaceManager.lookupName(req.query.uri);
    let arch = archiver('zip', { zlib: { level: 9 }})
    let contFast = 0;
    let contSlow = 0;

    doCrawlAndDownloadResource = function(url, recLevel, entryName) {
      if(0 < recLevel && downloadedFiles.length < req.query.maxFiles && !downloadedFiles.includes(entryName)){
          downloadedFiles.push(entryName);


        contFast++;
        fetch(url).then(response => {
          transform = response.body.pipe(getTransformStream(url, recLevel, replaceManager, doCrawlAndDownloadResource))
          transform.on('finish', () => {
            contSlow++;
            if(contFast == contSlow) {
              arch.finalize();
              arch.pipe(res);
            }
          });
          arch.append(transform, {name: entryName});
        });
      }
    }
    res.writeHead(200,{'Content-Type':'application/zip', 'Content-Disposition':'attachment;filename=file.zip'});
    doCrawlAndDownloadResource(req.query.uri, req.query.recLevel, nombre);
    arch.on('finish', () => res.end());

  }
}

const app = express()
const port = 3000


app.use(express.static(path.join(__dirname, 'public')));

//here goes the routing
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/crawler', function(req, res) {
  startCrawling(req,res);
});

//here goes the routing
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
