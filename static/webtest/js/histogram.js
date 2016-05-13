
$(document).ready(function(){
    var width = 512;
    var height = 512;
    var pixels;
    var canvas;
    var ctx;
    var svg;
    var chart;
    // We cache the histogram data (3 channels) and plot whichever
    // is the active slider
    var hdata = [];
    var lastChIdx = 0;

    $("#canvas").css({'width': width +'px', 'height': height +'px'});

    var img = new Image();

    // set up the svg histogram...
    var n = 256,
        margin = {top: 20, right: 0, bottom: 20, left: 0},
        testWidth = 512 - margin.left - margin.right,
        testHeight = 250 - margin.top - margin.bottom;
    svg = d3.select("body").append("svg")
        .attr("width", testWidth + margin.left + margin.right)
        .attr("height", testHeight + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


    var path = svg.append("g")
            .append("path")
            .attr("class", "line");
            // .attr("d", line);

    // Add slider markers
    var line = svg.selectAll("rect")
    .data([0, 256]);

    var lineEnter = line.enter().append("rect");
    lineEnter.attr("y", 0);
    lineEnter.attr("height", 300);
    lineEnter.attr("width", 1);
    lineEnter.attr("x", function(d, i) { return d * (testWidth/2); });



    var ViewerModel = Backbone.Model.extend({

        loadData: function(imgId) {
            $.getJSON("/webgateway/imgData/" + imgId + "/", function(data){
                console.log(data);
                console.log(this);

                data.theT = data.rdefs.defaultT;
                data.theZ = data.rdefs.defaultZ;
                this.set(data);
            }.bind(this));
        },

        setChannelWindow: function(idx, start, end) {
            var oldChs = this.get('channels');
            // Need to clone the list of channels...
            var chs = [];
            for (var i=0; i<oldChs.length; i++) {
                chs.push($.extend(true, {}, oldChs[i]));
            }
            // ... then set new value ...
            chs[idx].window.start = start;
            chs[idx].window.end = end;
            // ... so that we get the changed event triggering OK
            this.set('channels', chs);
        }
    });


    var model = new ViewerModel();


    // Build sliders when image loads....
    model.on('change:id', function(model){
        console.log("Image loaded: build channels...");
        console.log(arguments);

        var channels = model.get('channels');
        buildChannels(channels);
    });


    // load histogram data when new plane chosen
    model.on('change:theZ change:theT', function(model){
        console.log("Z/T changed");
        console.log(arguments);


        loadHistogramData(model);
    });

    var loadHistogramData = function(model) {

        console.log('loadHistogramData...');
        // we want 'full range' image (darkest to brightest pixels)
        // for the current Z/T plane

        var cStrings = [];
        _.each(model.get('channels'), function(c, i){
            cStrings.push(1+i + "|" + c.window.min + ":" + c.window.max + "$" + c.color);
        });
        var renderString = cStrings.join(","),
            imageId = model.get('id'),
            theZ = model.get('theZ'),
            theT = model.get('theT');

        var src = '/webgateway/render_image/' + imageId + "/" + theZ + "/" + theT +
                '/?c=' + renderString + "&m=c";
        console.log('src');
        // this will trigger loading of histogram data
        img.src = src;
    };


    // When we have the Image data, use it to populate the canvas
    img.onload = function() {
        canvas = document.getElementById("canvas");
        canvas.width = width;
        canvas.height = height;

        ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // and save a copy of the data
        raw = ctx.getImageData(0, 0, width, height);

        cacheHistogramData(raw);

        // plot current channel
        plotHistogram(lastChIdx);
    };


    var buildChannels = function(channels) {

        $('#sliders').empty();

        channels.forEach(function(ch, idx){
            $("<div style='background: #" + ch.color + "'></div>")
                .appendTo('#sliders')
                .slider({
                    range: true,
                    min: ch.window.min,
                    max: ch.window.max,
                    values: [ch.window.start, ch.window.end],
                    start: function() {
                        plotHistogram(idx);
                    },
                    slide: function(event, ui) {
                        // renderString(idx, ui.values[0], ui.values[1]);

                        // histogram has 256 columns, from min - max
                        // need to scale start and end within this range
                        var start = ui.values[0],
                            end = ui.values[1],
                            min = ch.window.min,
                            max = ch.window.max;
                        start = ((start - min)/(max - min)) * 256;
                        end = ((end - min)/(max - min)) * 256;
                        chartRange([start, end], '#' + ch.color);
                        // update image viewer canvas (not currently working)
                        // renderString(idx, ui.values[0], ui.values[1]);
                    },
                    stop: function(event, ui) {
                        console.log('stop', ui.values);
                        model.setChannelWindow(idx, ui.values[0], ui.values[1]);
                    }
                });
        });
    };


    var cacheHistogramData = function(pix) {

        var cdata;
        hdata = [];
        // go through 3 channels
        for (var c = 0; c < 3; c++){
            // go through all pixels of each channel (r,g,b or a)
            cdata = new Uint16Array(256);
            for (var i = c, n = pix.data.length; i < n; i+=4) {
                d = raw.data[i];
                cdata[d] = cdata[d] + 1;
            }
            hdata.push(cdata);
        }
    };


    var plotHistogram = function(chIndex) {

        lastChIdx = chIndex;

        var points = hdata[chIndex];
        var colors = ['#0000ff', '#00ff00', '#ff0000'];

        plotLine(points, colors[chIndex]);
    };


    var plotLine = function(data, color) {

        var x = d3.scale.linear()
            .domain([0, n - 1])
            .range([0, testWidth]);

        var y = d3.scale.linear()
            .domain([
                d3.min(data),
                d3.max(data)
            ])
            .range([testHeight, 0]);

        var line = d3.svg.line()
            .x(function(d, i) { return x(i); })
            .y(function(d, i) { return y(d); });

        svg.selectAll(".line")
            .datum(data)
            .attr("d", line)
            .attr('stroke', color);
    };


    // Update the specified channel of the image
    // var renderString = function(channel, start, end) {

    //     // get the current pixel data...
    //     pixels = ctx.getImageData(0, 0, width, height);

    //     var d;
    //     // go through all pixels of the specified channel (r,g,b or a)
    //     for (var i = channel, n = pixels.data.length; i < n; i+=4) {
    //         d = raw.data[i];
    //         if (d < start) {
    //             d = 0;
    //         } else if (d > end) {
    //             d = 255;
    //         } else {
    //             d = ((d - start) / (end - start)) * 255;
    //         }
    //         pixels.data[i] = d;
    //     }

    //     ctx.putImageData(pixels, 0, 0);
    // };
    

    var chartRange = function(values, color) {
        var circle = svg.selectAll("rect")
        .data(values)
        .attr("x", function(d, i) { return d * (testWidth/n); })
        .attr('fill', color);
    };


    model.on('change:theZ change:theT change:channels', function(model){
        console.log("Z/T or channels changed");

        var cStrings = [];
        _.each(model.get('channels'), function(c, i){
            cStrings.push(1+i + "|" + c.window.start + ":" + c.window.end + "$" + c.color);
        });
        var renderString = cStrings.join(","),
            imageId = model.get('id'),
            theZ = model.get('theZ'),
            theT = model.get('theT');

        var imgSrc = '/webgateway/render_image/' + imageId + "/" + theZ + "/" + theT +
                '/?c=' + renderString + "&m=c";

        console.log('updateImage', imgSrc);
        $("#viewer").attr('src', imgSrc);
    });

    $("#zSlider").on('input', function(){
        $("#zIndex").html($(this).val());
    }).on('change', function(){
        var theZ = $(this).val();
        model.set('theZ', theZ);
    });

    // start everything by loading image
    model.loadData(IMAGE_ID);
});