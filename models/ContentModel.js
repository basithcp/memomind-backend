import mongoose from "mongoose";

//create a schema
const Schema = mongoose.Schema;

//define the schema
const ContentSchema = new Schema({
    userId: { type: String, required: true },
    itemId: { type: String, required: true },
    itemName: {type: String, required: true},
    pages : [
        {page : {type : Number, required : true},
        source: {type : String, required : false},
        text : {type:String, required : false},
        confidence : {type : String, required : false},
        },
    ],
});

// Optional: prevent duplicate (userId + itemId). If you want duplicates, remove this.
ContentSchema.index({ userId: 1, itemId: 1 }, { unique: true });

// Use existing model if it was already compiled (prevents OverwriteModelError)
const Content = mongoose.models.Content || mongoose.model('Content', ContentSchema);

export default Content;