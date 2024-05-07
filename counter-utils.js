/* Functions to work with a collection of counters in your
 * database. The "counters" argument is a collection of counter
 * documents, like this:

   {collection: 'events', counter: 17}

* a document like that means that the next value for the 'events'
* counter is 18. The 'collection' value should be unique (you only
* have one 'events' counter).

There are several functions in this file, but you will probably *only*
need the .incr function:

async function incr(counters, key) { ... }

Returns a promise resolving to the new value.

 @param(counters) a collection of counter documents
 @param(key) a counter name, such as 'events' or 'recipes'

 Scott D. Anderson
 Version 1.0
 April 2024
 */
 



/* asynchronous function to look up the current counter document.
 * Returns a promise resolving to the current value, or null if there
 * is no counter documents. Throws an error if there are too many
 * counters. */

async function get(counters, key) {
    let docs = await counters.find({collection: key}).toArray();
    let n = docs.length;
    if(n==1) {
        return docs[0].counter;
    } else if( n==0 ) {
        // console.log(`Didn't find any counters for collection ${key}`);
        return null;
    } else {
        console.log(`Found multiple (${n}) counters for collection ${key}`);
        docs.forEach((c) => console.log(c));
        throw new Error(`Found multiple (${n}) counters for collection ${key}`);
    }
}

/* asynchronous function to initialize the counter document to 1.
 * Returns a promise resolving to no value. This should *not* be used
 * if the counter already exists, or you'll end up with multiple
 * counters for this collection. This function checks for that, but
 * it's not atomic. */

async function init(counters, key) {
    let curr = await get(counters, key);
    if(!curr) {
        let result = await counters.insertOne({collection: key, counter: 1});
        console.log(result);
    }
}

/* asynchronous function to reset the counter document to 1.  Returns
 * a promise resolving to no value. Warning: if you have already
 * created IDs using this counter, resetting it to one will re-use
 * values, and that's probably not what you want. IDs should be
 * unique. This function really only exists for special
 * applications. */

async function reset(counters, key) {
    let query = {collection: key};
    let update = {$set:  {counter: 1}};
    let options = {$upsert: true}; // insert if not exists
    let result = await counters.updateOne(query, update, options);
    console.log(result);
}

/* asynchronous function to increment the counter document by 1.
 * Returns a promise resolving to the new value.

 @param(counters) a collection of counter documents
 @param(key) a counter name, such as 'events' or 'recipes'

*/

async function incr(counters, key) {
    // this will update the document and return the document after the update
    let result = await counters.findOneAndUpdate({collection: key},
                                                 {$inc: {counter: 1}}, 
                                                 {returnDocument: "after"});
    if(result) {
        return result.counter;
    } else {
        console.log(`no counter found: ${key}`);
    }
}

// You probably *only* need the .incr function. 

module.exports = {
    get, init, incr, reset
};