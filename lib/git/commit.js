var sys = require('sys'),
  Actor = require('git/actor').Actor,
  Tree = require('git/tree').Tree,
  Diff = require('git/diff').Diff;

// Create a commit object
var Commit = exports.Commit = function(repo, id, parents, tree, author, authored_date, comitter, committed_date, message) {
  var _repo = repo, _id = id, _parents = parents, _tree = tree, _author = author, _authored_date = authored_date;
  var _comitter = comitter, _committed_date = committed_date, _id_abbrev = null;
  // Ensure we have an empty message at least
  message = message ? message : [];
  var _message = message.join("\n");
  // Extract short message
  var message_lines_filtered = message.filter(function(line) {
    return line.trim() == '' ? false : true;
  })
  var _short_message = message_lines_filtered.length > 0 ? message_lines_filtered[0] : '';
  
  // Internal properties
  Object.defineProperty(this, "repo", { get: function() { return _repo; }, set: function(value) { _repo = value; }, enumerable: true});    
  Object.defineProperty(this, "id", { get: function() { return _id; }, set: function(value) { _id = value; }, enumerable: true});    
  Object.defineProperty(this, "sha", { get: function() { return _id; }, set: function(value) { _id = value; }, enumerable: true});    
  Object.defineProperty(this, "parents", { get: function() { 
      return lazy_reader(_repo, _id, 'parents', _parents); 
    }, set: function(value) { _parents = value; }, enumerable: true});    
  Object.defineProperty(this, "tree", { get: function() { 
      return lazy_reader(_repo, _id, 'tree', _tree); 
    }, set: function(value) { _tree = value; }, enumerable: true});    
  Object.defineProperty(this, "author", { get: function() { 
      return lazy_reader(_repo, _id, 'author', _author); 
    }, set: function(value) { _author = value; }, enumerable: true});    
  Object.defineProperty(this, "authored_date", { get: function() { 
      return lazy_reader(_repo, _id, 'authored_date', _authored_date);
    }, set: function(value) { _authored_date = value; }, enumerable: true});    
  Object.defineProperty(this, "comitter", { get: function() { 
      return lazy_reader(_repo, _id, 'comitter', _comitter);
    }, set: function(value) { _comitter = value; }, enumerable: true});    
  Object.defineProperty(this, "committed_date", { get: function() { 
      return lazy_reader(_repo, _id, 'committed_date', _committed_date); 
    }, set: function(value) { _committed_date = value; }, enumerable: true});    
  Object.defineProperty(this, "message", { get: function() { 
      return lazy_reader(_repo, _id, 'message', _message); 
    }, set: function(value) { _message = value; }, enumerable: true});    
  Object.defineProperty(this, "short_message", { get: function() { 
      return lazy_reader(_repo, _id, 'short_message', _short_message); 
    }, set: function(value) { _short_message = value; }, enumerable: true});    

  Object.defineProperty(this, "_id_abbrev", { get: function() { return _id_abbrev; }, set: function(value) { _id_abbrev = value; }, enumerable: true});    
}

var lazy_reader = function(repo, id, name, variable) {
  if(variable) return variable;
  // Control the flow
  var done = false;
  var commit = null;
  // Fetch all the commits
  Commit.find_all(repo, id, {max_count:1}, function(err, commits) {
    if(err) return done = true;
    commit = commits[0][name];
    done = true;
  })
  while(!done) {};
  return commit;  
}

// Load a commit
Commit.prototype.load = function(callback) {
  var self = this;
  
  Commit.find_all(this.repo, this.id, {max_count:1}, function(err, commits) {
    if(err) return callback(err, commits);
    var commit = commits[0];
    Object.keys(commit).forEach(function(key) {
      self[key] = commit[key];
    });
    callback(null, self);
  });
}

// Chomp text removing end carriage returns
var chomp = function chomp(raw_text) {
  return raw_text.replace(/(\n|\r)+$/, '');
}

// Fetch the short form of an id
Commit.prototype.id_abbrev = function(callback) {
  var self = this;
  
  if(this._id_abbrev) return callback(null, this._id_abbrev);
  this.repo.git.rev_parse({}, this.id, function(err, id) {
    if(err) return callback(err, id);
    self._id_abbrev = chomp(id).substr(0, 7);
    callback(null, self._id_abbrev);
  })
}

// Parse the actor and create the object
var actor = function(line) {
  var results = line.match(/^.+? (.*) (\d+) .*$/);
  var actor = results[1];
  var epoch = results[2];
  // Return the objects
  return [Actor.from_string(actor), new Date(parseInt(epoch) * 1000)]
}

// Convert commit text to list of commits
Commit.list_from_string = function(repo, text) {  
  // Split up the result
  var lines = text.split("\n");
  var commits = [];
  // Parse all commit messages
  while(lines.length > 0) {    
    var id = lines.shift().split(/ /).pop();
    var tree = new Tree(repo, lines.shift().split(/ /).pop());
    
    // Let's get the parents
    var parents = [];
    while(lines[0].match(/^parent/)) {
      parents.push(new Commit(repo, lines.shift().split(/ /).pop()))
    }
    // Let's get the author and committer
    var actor_info = actor(lines.shift());
    var author = actor_info[0];
    var authored_date = actor_info[1]
    var committer_info = actor(lines.shift());
    var comitter = committer_info[0];
    var committed_date = committer_info[1];
    // Unpack encoding
    var encoding = lines[0].match(/^encoding/) ? lines.shift().split().pop() : '';
    // Jump empty space
    lines.shift();    
    // Unpack message lines
    var message_lines = [];    
    while(lines[0].match(/^ {4}/)) {
      var message_line = lines.shift();
      message_lines.push(message_line.substring(4, message_line.length)) ;
    }
    
    // Move and point to next message
    while(lines[0] != null && lines[0] == '') lines.shift();
    // Create commit object
    commits.push(new Commit(repo, id, parents, tree, author, authored_date, comitter, committed_date, message_lines));
  }
  // Return all the commits
  return commits;
}

// Locate all commits for a give set of parameters
Commit.find_all = function(repo, reference, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};    
  
  // Merge the options with the default_options
  if(!options.pretty) options['pretty'] = 'raw';  
  // If we have a reference use that for the lookup
  if(!reference) options['all'] = true;
  // Locate revisions
  repo.git.rev_list(options, reference, function(err, revision_output) {
    if(err) return callback(err, []);
    // Turn string into a list of revisions
    callback(null, Commit.list_from_string(repo, revision_output));
  });
}

// Return the count of committs for a given start
Commit.count = function(repo, ref, callback) {
  repo.git.rev_list({}, ref, function(err, revision_output) {
    if(err) return callback(err, revision_output);
    callback(null, parseInt((revision_output.length/41)));
  })
}

// Show diffs between two trees
//  repo: the repo object
//  a: named commit
//  b: optional named commit, passing an array assumes you wish to omit the second
//     named commit and limit the diff to the given paths
//  paths: an array of paths to limit the diff.
//
// Returns array of diffs (baked)
Commit.diff = function(repo, a, b, paths, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  b = args.length ? args.shift() : null;      
  paths = args.length ? args.shift() : [];      
  
  // If b is an array we skipped the b parameter
  if(Array.isArray(b)) {
    paths = b;
    b = null;
  }
  
  // Set up parameters correctly
  if(paths.length > 0) paths.unshift("--");
  if(b) paths.unshift(b);
  paths.unshift(a);
  
  // Add the options at the start
  paths.unshift({full_index:true});
  // Add the callback to the end of the array
  paths.push(function(err, text) {
    // Create a list of diffs from the string
    Diff.list_from_string(repo, text, callback);    
  });
  
  // Execute diff using the parameters
  repo.git.diff.apply(this, paths)
}

// Return the diffs for a commit
Commit.prototype.diffs = function(callback) {
  var parents = this.parents;
  
  // If we have no parents
  if(parents.length == 0) {
    // TODO TODO TODO TODO
    // TODO TODO TODO TODO
    // TODO TODO TODO TODO
  } else {
    Commit.diff(this.repo, parents[0].id, this.id, callback)    
  }
}



















