var mongoose = require('mongoose');
var superagent = require('superagent');
var WordSearchTemplate = require('./models/WordSearchTemplate');
var PDFDocument = require('pdfkit');
var fs = require('fs'),
request = require('request');
var kue = require('kue')
  , jobs = kue.createQueue();


var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    console.log('content-type:', res.headers['content-type']);
    console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

function generate(data, done){
  //load the pattern
  WordSearchTemplate.findById(data.id, function(err, wS){
    if(err) throw err;
    superagent
    .post('http://db.wordsearchcreatorhq.com/wordsearch/createwordsearch')
    .send({ Words: data.words, Pattern: wS.pattern.join('\r\n') })
    .set('Accept', 'application/json')
    .end(function(error, res){
      console.log('downloading picture' + res.body);
      download('http://db.wordsearchcreatorhq.com/wsearches/' + res.body + '.png', 'wsearches/' + res.body + '.png', function(){
        console.log('done downloading');

        if(wS.height > wS.width) {
          // Create a document
          var doc = new PDFDocument();

          doc.pipe(fs.createWriteStream('wsearches/'+ res.body +'.pdf'));

          var marginLeft = 50;
          var marginTop = 50;

          // draw some text
          doc.fontSize(25)
          .text(data.title, marginLeft, marginTop);

          doc.image('wsearches/' + res.body + '.png', marginLeft, 50 + marginTop, {fit: [500, 480]});


          // and some justified text wrapped into columns
          var words = data.words;
          var lineHeight = 3;
          var columns = 4;
          doc.text('Words', marginLeft, 550 + marginTop)
          .fontSize(12)
          .moveDown()
          .text(words.join('\n'), {
            width: 412,
            align: 'left',
            indent: 30,
            columns: columns,
            lineGap: lineHeight,
            height: 100,
            ellipsis: true
          });

          doc.end();

        }
        else {
          var doc = new PDFDocument({
            layout : 'landscape'
          }
        );
        //var stream = doc.pipe(blobStream());

        doc.pipe(fs.createWriteStream('wsearches/'+ res.body +'.pdf'));

        var marginLeft = 50;
        var marginTop = 50;

        // draw some text
        doc.fontSize(25)
        .text(data.title, marginLeft, marginTop);

        doc.image('wsearches/' + res.body + '.png', marginLeft, 50+ marginTop,{fit: [670, 350]});

        // and some justified text wrapped into columns
        var words = data.words;
        var lineHeight = 3;
        var columns = 5;
        doc.text('Words', marginLeft, 420 + marginTop)
        .fontSize(12)
        .moveDown()
        .text(words.join('\n'), {
          width: 650,
          align: 'left',
          indent: 30,
          columns: columns,
          lineGap: lineHeight,
          height: 70,
          ellipsis: true
        });

        doc.end();
      }

      jobs.create('email', {title: data.title, file: 'wsearches/'+ res.body + '.pdf', emailTo: data.email}).save();
      done();

    });

  });
});

}




jobs.process('email', function(job, done){
  var data = job.data;
  var postmark = require("postmark")("74fe382c-9252-11e3-a73b-0025909414ec");
  console.log(data.title + data.emailTo + data.file);
  postmark.send({
    "From": "info@wordsearchcreatorhq.com",
    "To": data.emailTo,
    "Subject": "Wordsearch - " + data.title,
    "TextBody": "Hey there,\r\n Please find attached your wordsearch that you generated on http://www.wordsearchcreatorhq.com. \r\nPlease share.",
    /*"Attachments": [{
      "Content": fs.readFileSync(data.file).toString('base64'),
      "Name": data.title + ".pdf",
      "ContentType": "application/pdf"
    }]*/
  }, function(error, success) {
    if(error) {
      console.error("Unable to send via postmark: " + error.message);
      done(error);
      return;
    }
    console.info("Sent to postmark for delivery");
    done();
  });
});

exports.generate = generate;
