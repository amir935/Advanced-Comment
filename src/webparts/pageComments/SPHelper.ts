import { sp } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists/web";
import "@pnp/sp/folders/web";
import "@pnp/sp/files/folder";
import "@pnp/sp/items/list";
import "@pnp/sp/fields/list";
import "@pnp/sp/views/list";
import "@pnp/sp/site-users/web";
import { IList } from "@pnp/sp/lists";
import * as _ from "lodash";


type VoteUser = { userid: number; name: string };
type VoteEntry = { commentID: number; userVote: VoteUser[] };


export default class SPHelper {
  private lst_pageComments: string = "";
  private lst_pageDocuments: string = "";
  private lst_docListName: string = "";
  private _list: IList = null;
  private _doclist: IList = null;
  private cqPostDocs: string = `<View>
                                    <Query>
                                        <Where>
                                            <And>
                                                <Eq>
                                                    <FieldRef Name='FSObjType' />
                                                    <Value Type='Text'>1</Value>
                                                </Eq>
                                                <Eq>
                                                    <FieldRef Name='FileRef' />
                                                    <Value Type='Text'>{{FilePath}}</Value>
                                                </Eq>
                                            </And>
                                        </Where>
                                        <ViewFields><FieldRef Name="ID" /></ViewFields>
                                    </Query>
                                </View>`;

  public constructor(lstDocLib?: string) {
    this.lst_pageComments = "Page Comments123";
    this._list = sp.web.lists.getByTitle(this.lst_pageComments);
    if (lstDocLib) {
      this.lst_pageDocuments = lstDocLib;
    }
  }

  public getDocLibInfo = async () => {
    this._doclist = sp.web.lists.getById(this.lst_pageDocuments);
    let listInfo: any = await this._doclist.select("Title").get();
    this.lst_docListName = listInfo.Title;
  };

  public queryList = async (query, $list: IList) => {
    return await $list.getItemsByCAMLQuery(query);
  };

  public getCurrentUserInfo = async () => {
    let currentUserInfo = await sp.web.currentUser.get();
    return {
      ID: currentUserInfo.Id,
      Email: currentUserInfo.Email,
      LoginName: currentUserInfo.LoginName,
      DisplayName: currentUserInfo.Title,
      Picture:
        "/_layouts/15/userphoto.aspx?size=S&username=" +
        currentUserInfo.UserPrincipalName,
    };
  };

  public getSiteUsers = async (currentUserId: number) => {
    let resusers = await sp.web.siteUsers
      .filter("IsHiddenInUI eq false and PrincipalType eq 1")
      .get();
    _.remove(resusers, (o) => {
      return o.Id == currentUserId || o.Email == "";
    });
    let userResults = [];
    resusers.map((user) => {
      userResults.push({
        id: user.Id,
        fullname: user.Title,
        email: user.Email,
        profile_picture_url:
          "/_layouts/15/userphoto.aspx?size=S&username=" +
          user.UserPrincipalName,
      });
    });
    return userResults;
  };

  public getPostAttachmentFilePath = async (pageUrl) => {
    let pageName = pageUrl
      .split("/")
      [pageUrl.split("/").length - 1].split(".")
      .slice(0, -1)
      .join(".");
    let res = await sp.web.select("ServerRelativeUrl").get();
    let doclistName =
      this.lst_docListName.toLowerCase() === "documents"
        ? "Shared Documents"
        : this.lst_docListName;
    return res.ServerRelativeUrl + "/" + doclistName + "/" + pageName;
  };

  public checkForPageFolder = async (postAttachmentPath) => {
    let xml = this.cqPostDocs.replace("{{FilePath}}", postAttachmentPath);
    let q = {
      ViewXml: xml,
    };
    let res = await this.queryList(q, this._doclist);
    if (res.length > 0) return true;
    else return false;
  };

  // public getPostComments = async (pageurl, currentUserInfo, commentJson = null) => {
  //   // Get item from SharePoint
  //   let pagecomments = await this._list.items
  //     .select("Comments", "Likes", "FieldValuesAsText/Comments", "FieldValuesAsText/Likes")
  //     .filter(`PageURL eq '${pageurl}'`)
  //     .expand("FieldValuesAsText")
  //     .get();

  //   if (pagecomments.length === 0) return [];

  //   // Parse raw JSON from SharePoint fields
  //   let tempComments = pagecomments[0].FieldValuesAsText.Comments;
  //   let tempLikes = pagecomments[0].FieldValuesAsText.Likes;

  //   let jsonComments = tempComments ? JSON.parse(tempComments) : [];
  //   let jsonLikes = tempLikes ? JSON.parse(tempLikes) : [];

  //   // 🔁 If commentJson is passed in (e.g., vote button clicked), update likes
  //   if (commentJson) {
  //     let voteEntry = _.find(jsonLikes, (l) => l.commentID === commentJson.id);

  //     if (voteEntry) {
  //       let userVoteIndex = _.findIndex(voteEntry.userVote, (o:any) => o.userid === currentUserInfo.ID);
  //       let userAlreadyVoted = userVoteIndex !== -1;

  //       if (commentJson.user_has_upvoted) {
  //         if (!userAlreadyVoted) {
  //           voteEntry.userVote.push({
  //             userid: currentUserInfo.ID,
  //             name: currentUserInfo.DisplayName
  //           });
  //         }
  //       } else {
  //         if (userAlreadyVoted) {
  //           voteEntry.userVote.splice(userVoteIndex, 1);
  //         }
  //       }
  //     } else {
  //       // No existing entry for this comment → create one if upvoted
  //       if (commentJson.user_has_upvoted) {
  //         jsonLikes.push({
  //           commentID: commentJson.id,
  //           userVote: [
  //             {
  //               userid: currentUserInfo.ID,
  //               name: currentUserInfo.DisplayName
  //             }
  //           ]
  //         });
  //       }
  //     }

  //     // Save the updated likes to SharePoint
  //     await this.updateVoteForComment(pageurl, jsonLikes);
  //   }

  //   // 🧠 Attach vote data (like count and user_has_upvoted) to each comment
  //   jsonLikes.forEach((likeEntry) => {
  //     let comment = _.find(jsonComments, (c) => c.id === likeEntry.commentID);
  //     if (comment) {
  //       comment.upvote_count = likeEntry.userVote.length;
  //       comment.user_has_upvoted = !!_.find(likeEntry.userVote, (v) => v.userid === currentUserInfo.ID);
  //     }
  //   });

  //   return jsonComments;
  // };

  public getPostComments = async (
    pageurl,
    currentUserInfo,
    commentJson = null
  ) => {
    const res = await this._list.items
      .select(
        "Comments",
        "Likes",
        "FieldValuesAsText/Comments",
        "FieldValuesAsText/Likes"
      )
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();

    if (res.length === 0) return [];

    const rawComments = res[0].FieldValuesAsText.Comments;
    const rawLikes = res[0].FieldValuesAsText.Likes;

    const jsonComments = rawComments ? JSON.parse(rawComments) : [];
    const jsonLikes = rawLikes ? JSON.parse(rawLikes) : [];

    // 🔁 If vote request is passed in
    if (commentJson) {
      let voteEntry = jsonLikes.find((l) => l.commentID === commentJson.id);

      if (voteEntry) {
        const hasVoted = voteEntry.userVote.some(
          (v) => v.userid === currentUserInfo.ID
        );

        if (commentJson.user_has_upvoted && !hasVoted) {
          voteEntry.userVote.push({
            userid: currentUserInfo.ID,
            name: currentUserInfo.DisplayName,
          });
        }

        if (!commentJson.user_has_upvoted && hasVoted) {
          voteEntry.userVote = voteEntry.userVote.filter(
            (v) => v.userid !== currentUserInfo.ID
          );
        }
      } else if (commentJson.user_has_upvoted) {
        jsonLikes.push({
          commentID: commentJson.id,
          userVote: [
            {
              userid: currentUserInfo.ID,
              name: currentUserInfo.DisplayName,
            },
          ],
        });
      }

      await this.updateVoteForComment(pageurl, jsonLikes);
    }

    // ➕ Add upvote_count and user_has_upvoted to each comment
    jsonLikes.forEach((likeEntry) => {
      const comment = jsonComments.find((c) => c.id === likeEntry.commentID);
      if (comment) {
        comment.upvote_count = likeEntry.userVote.length;
        comment.user_has_upvoted = likeEntry.userVote.some(
          (v) => v.userid === currentUserInfo.ID
        );
      }
    });

    return jsonComments;
  };

  public getComment = async (pageurl) => {
    let pagecomments = await this._list.items
      .select("Comments", "FieldValuesAsText/Comments")
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();
    if (pagecomments.length > 0)
      return pagecomments[0].FieldValuesAsText.Comments;
    else return null;
  };

  public addComment = async (pageUrl, comments) => {
    let pageName = pageUrl.split("/")[pageUrl.split("/").length - 1];
    let commentsToAdd = await sp.web.lists
      .getByTitle(this.lst_pageComments)
      .items.add({
        Title: pageName,
        PageURL: pageUrl,
        Comments: JSON.stringify(comments),
      });
    return commentsToAdd;
  };

  public updateComment = async (pageurl, comments) => {
    let pageComment = await this._list.items
      .select("ID", "PageURL")
      .filter(`PageURL eq '${pageurl}'`)
      .get();
    if (comments.length > 0) {
      if (pageComment.length > 0) {
        let pageCommentsToUpdate = await this._list.items
          .getById(pageComment[0].ID)
          .update({
            Comments: JSON.stringify(comments),
          });
        return pageCommentsToUpdate;
      }
    } else {
      return await this._list.items.getById(pageComment[0].ID).delete();
    }
  };

  public postComment = async (pageurl, commentJson, currentUserInfo) => {
    commentJson.created_by_current_user = false;
    let comments = await this.getPostComments(pageurl, currentUserInfo);
    if (comments.length > 0) {
      comments.push(commentJson);
      let updateComments = await this.updateComment(pageurl, comments);
      return updateComments;
    } else {
      comments.push(commentJson);
      let addComments = await this.addComment(pageurl, comments);
      return addComments;
    }
  };

  public addVoteForComment = async (pageurl, commentJson, currentUserInfo) => {
    var tempLikes = [];
    tempLikes.push({
      commentID: commentJson.id,
      userVote: [
        { userid: currentUserInfo.ID, name: currentUserInfo.DisplayName },
      ],
    });
    let pageComment = await this._list.items
      .select("ID")
      .filter(`PageURL eq '${pageurl}'`)
      .get();
    if (pageComment.length > 0) {
      return await this._list.items
        .getById(pageComment[0].ID)
        .update({ Likes: JSON.stringify(tempLikes) });
    }
  };

  public updateVoteForComment = async (pageurl, jsonLikes) => {
    let pageComment = await this._list.items
      .select("ID")
      .filter(`PageURL eq '${pageurl}'`)
      .get();
    if (pageComment.length > 0) {
      return await this._list.items
        .getById(pageComment[0].ID)
        .update({ Likes: JSON.stringify(jsonLikes) });
    }
  };

  // public voteComment = async (pageurl, commentJson, currentUserInfo) => {
  //   let res = await this._list.items
  //     .select("Likes", "FieldValuesAsText/Likes")
  //     .filter(`PageURL eq '${pageurl}'`)
  //     .expand("FieldValuesAsText")
  //     .get();
  //   if (res.length > 0) {
  //     var tempLikes = res[0].FieldValuesAsText.Likes;
  //     if (tempLikes != undefined && tempLikes != null && tempLikes !== "") {
  //       // Likes already exits so update the item
  //       var jsonLikes = JSON.parse(tempLikes);
  //       var userAlreadyVoted = _.find(jsonLikes, (o) => {
  //         return (
  //           o.commentID == commentJson.id &&
  //           _.find(o.userVote, (oo) => {
  //             return oo.userid == currentUserInfo.ID;
  //           })
  //         );
  //       });
  //       var userPresent =
  //         userAlreadyVoted === undefined || userAlreadyVoted == null
  //           ? false
  //           : true;
  //       var fil = _.find(jsonLikes, (o) => {
  //         return o.commentID == commentJson.id;
  //       });
  //       if (fil !== undefined && fil !== null) {
  //         // Found likes for the comment id
  //         if (commentJson.user_has_upvoted) {
  //           if (!userPresent)
  //             fil.userVote = _.concat(fil.userVote, {
  //               userid: currentUserInfo.ID,
  //               name: currentUserInfo.DisplayName,
  //             });
  //         } else {
  //           if (userPresent) {
  //             if (fil !== undefined && fil !== null)
  //               _.remove(fil.userVote, (o) => {
  //                 return o["userid"] == currentUserInfo.ID;
  //               });
  //           }
  //         }
  //       } else {
  //         // No likes found for the comment id
  //         jsonLikes.push({
  //           commentID: commentJson.id,
  //           userVote: [
  //             { userid: currentUserInfo.ID, name: currentUserInfo.DisplayName },
  //           ],
  //         });
  //       }
  //       return await this.updateVoteForComment(pageurl, jsonLikes);
  //     } else {
  //       // Likes doesn't exists so add new
  //       if (commentJson.user_has_upvoted)
  //         return await this.addVoteForComment(
  //           pageurl,
  //           commentJson,
  //           currentUserInfo
  //         );
  //     }
  //   } else {
  //     return commentJson;
  //   }
  // };


  public voteComment = async (pageurl, commentJson, currentUserInfo) => {
    const res = await this._list.items
      .select("Likes", "FieldValuesAsText/Likes")
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();

    if (res.length === 0) return commentJson;

    const rawLikes = res[0].FieldValuesAsText.Likes;
    const jsonLikes = rawLikes ? JSON.parse(rawLikes) : [];

    let voteEntry = jsonLikes.find((l) => l.commentID === commentJson.id);

    if (voteEntry) {
      const hasVoted = voteEntry.userVote.some(
        (v) => v.userid === currentUserInfo.ID
      );

      if (commentJson.user_has_upvoted && !hasVoted) {

        voteEntry.userVote.push({
          userid: currentUserInfo.ID,
          name: currentUserInfo.DisplayName,
        });
      }


      if (!commentJson.user_has_upvoted && hasVoted) {
        voteEntry.userVote = voteEntry.userVote.filter(
          (v) => v.userid !== currentUserInfo.ID
        );
      }
    } else if (commentJson.user_has_upvoted) {
      jsonLikes.push({

        commentID: commentJson.id,
        userVote: [
          {
            userid: currentUserInfo.ID,
            name: currentUserInfo.DisplayName,
          },
        ],
      });
    }


    if (jsonLikes.length > 0) {
      return await this.updateVoteForComment(pageurl, jsonLikes);
    }

    return await this.addVoteForComment(pageurl, commentJson, currentUserInfo);
  };



  public deleteComment = async (pageurl, commentJson) => {
    let comments = await this.getComment(pageurl);
    if (comments !== undefined && comments !== null) {
      var jsonComments = JSON.parse(comments);

      // 🛠 Remove the comment itself
      _.remove(jsonComments, (o) => o["id"] == commentJson.id);

      // 🛠 Remove orphan children (comments whose parent was the deleted comment)
      _.remove(jsonComments, (o) => o["parent"] == commentJson.id);

      // 🛠 🆕 After removing, clean again for any invalid parent references
      const validIds = new Set(jsonComments.map((c) => c.id));
      jsonComments = jsonComments.filter(
        (c) => !c.parent || validIds.has(c.parent)
      );

      return await this.updateComment(pageurl, jsonComments);
    }
  };

  public editComments = async (pageurl, commentJson) => {
    let comment = await this.getComment(pageurl);
    if (comment !== undefined && comment !== null) {
      var jsonComments = JSON.parse(comment);
      var match = _.find(jsonComments, (o) => {
        return o.id == commentJson.id;
      });
      if (!match) return; // Exit if no matching comment

      _.merge(match, {
        pings: commentJson.pings,
        content: commentJson.content,
        modified: commentJson.modified,
      });
      return await this.updateComment(pageurl, jsonComments);
    }
  };

  public createFolder = async (folderPath) => {
    return await sp.web.folders.add(folderPath);
  };

  public uploadFileToFolder = async (folderpath, fileinfo) => {
    return await sp.web
      .getFolderByServerRelativeUrl(folderpath)
      .files.add(fileinfo.name, fileinfo.content, true);
  };

  public postAttachments = async (
    commentArray: any[],
    pageFolderExists,
    postAttachmentPath
  ): Promise<any> => {
    var self = this;
    return new Promise(async (resolve, reject) => {
      if (!pageFolderExists) await this.createFolder(postAttachmentPath);
      var reader = new FileReader();
      reader.onload = async () => {
        var contentBuffer = reader.result;
        let uploadedFile = await self.uploadFileToFolder(postAttachmentPath, {
          name: commentArray[0].file.name,
          content: contentBuffer,
        });
        _.set(commentArray[0], "file_id", uploadedFile.data.UniqueId);
        _.set(
          commentArray[0],
          "file_url",
          postAttachmentPath + "/" + commentArray[0].file.name
        );
        resolve(commentArray);
      };
      await reader.readAsArrayBuffer(commentArray[0].file);
    });
  };

  public checkListExists = async (): Promise<boolean> => {
    return new Promise<boolean>(async (res, rej) => {
      sp.web.lists
        .getByTitle(this.lst_pageComments)
        .get()
        .then((listExists) => {
          res(true);
        })
        .catch(async (err) => {
          let listExists = await (
            await sp.web.lists.ensure(this.lst_pageComments)
          ).list;
          await listExists.fields.addText("PageURL", 255, {
            Required: true,
            Description: "",
          });
          await listExists.fields.addMultilineText(
            "Comments",
            6,
            false,
            false,
            false,
            false,
            { Required: true, Description: "" }
          );
          await listExists.fields.addMultilineText(
            "Likes",
            6,
            false,
            false,
            false,
            false,
            { Required: false, Description: "" }
          );
          let allItemsView = await listExists.views.getByTitle("All Items");
          await allItemsView.fields.add("PageURL");
          await allItemsView.fields.add("Comments");
          await allItemsView.fields.add("Likes");
          res(true);
        });
    });
  };
}
