import { sp } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists/web";
import "@pnp/sp/folders/web";
import "@pnp/sp/files/folder";
import "@pnp/sp/items/list";
import "@pnp/sp/fields/list";
import "@pnp/sp/views/list";
import "@pnp/sp/site-users/web";
import "@pnp/sp/site-groups";
import { IList } from "@pnp/sp/lists";
import * as _ from "lodash";
export default class SPHelper {
    private lst_pageComments: string = '';
    private lst_pageDocuments: string = '';
    private lst_docListName: string = '';
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
        let listInfo: any = await this._doclist.select('Title').get();
        this.lst_docListName = listInfo.Title;
    }

    public queryList = async (query, $list: IList) => {
        return await $list.getItemsByCAMLQuery(query);
    }

    public getCurrentUserInfo = async () => {
        let currentUserInfo = await sp.web.currentUser.get();
        return ({
            ID: currentUserInfo.Id,
            Email: currentUserInfo.Email,
            LoginName: currentUserInfo.LoginName,
            DisplayName: currentUserInfo.Title,
            Picture: '/_layouts/15/userphoto.aspx?size=S&username=' + currentUserInfo.UserPrincipalName,
        });
    }

    public getSiteUsers = async (currentUserId: number) => {
        let resusers = await sp.web.siteUsers.filter('IsHiddenInUI eq false and PrincipalType eq 1').get();
        _.remove(resusers, (o) => { return o.Id == currentUserId || o.Email == ""; });
        let userResults = [];
        resusers.map((user) => {
            userResults.push({
                id: user.Id,
                fullname: user.Title,
                email: user.Email,
                profile_picture_url: '/_layouts/15/userphoto.aspx?size=S&username=' + user.UserPrincipalName
            });
        });
        return userResults;
    }

    public getPostAttachmentFilePath = async (pageUrl) => {
        let pageName = pageUrl.split('/')[pageUrl.split('/').length - 1].split('.').slice(0, -1).join('.');
        let res = await sp.web.select('ServerRelativeUrl').get();
        let doclistName = (this.lst_docListName.toLowerCase() === 'documents') ? "Shared Documents" : this.lst_docListName;
        return res.ServerRelativeUrl + "/" + doclistName + "/" + pageName;
    }

    public checkForPageFolder = async (postAttachmentPath) => {
        let xml = this.cqPostDocs.replace('{{FilePath}}', postAttachmentPath);
        let q = {
            ViewXml: xml
        };
        let res = await this.queryList(q, this._doclist);
        if (res.length > 0) return true; else return false;
    }

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

    jsonLikes.forEach((likeEntry) => {
      const comment = jsonComments.find((c) => c.id === likeEntry.commentID);
      if (comment) {
        comment.upvote_count = likeEntry.userVote.length;
        comment.user_has_upvoted = likeEntry.userVote.some(
          (v) => v.userid === currentUserInfo.ID
        );
      }
    });

    // Add creator name to each comment (removes 'YOU")
    jsonComments.forEach((comment) => {
      comment.creator_name = comment.fullname;
    });

    return jsonComments;
  };

       public getComment = async (pageurl) => {
        let pagecomments = await this._list.items.select('Comments', 'FieldValuesAsText/Comments')
            .filter(`PageURL eq '${pageurl}'`).expand('FieldValuesAsText').get();
        if (pagecomments.length > 0) return pagecomments[0].FieldValuesAsText.Comments;
        else return null;
    }

    public addComment = async (pageUrl, comments) => {
        let pageName = pageUrl.split('/')[pageUrl.split('/').length - 1];
        let commentsToAdd = await sp.web.lists.getByTitle(this.lst_pageComments).items.add({
            Title: pageName,
            PageURL: pageUrl,
            Comments: JSON.stringify(comments)
        });
        return commentsToAdd;
    }

    public updateComment = async (pageurl, comments) => {
        let pageComment = await this._list.items.select('ID', 'PageURL').filter(`PageURL eq '${pageurl}'`).get();
        if (comments.length > 0) {
            if (pageComment.length > 0) {
                let pageCommentsToUpdate = await this._list.items.getById(pageComment[0].ID).update({
                    Comments: JSON.stringify(comments)
                });
                return pageCommentsToUpdate;
            }
        } else {
            return await this._list.items.getById(pageComment[0].ID).delete();
        }

    }

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
    }

    public addVoteForComment = async (pageurl, commentJson, currentUserInfo) => {
        var tempLikes = [];
        tempLikes.push({
            commentID: commentJson.id,
            userVote: [{ userid: currentUserInfo.ID, name: currentUserInfo.DisplayName }]
        });
        let pageComment = await this._list.items.select('ID').filter(`PageURL eq '${pageurl}'`).get();
        if (pageComment.length > 0) {
            return await this._list.items.getById(pageComment[0].ID).update({ Likes: JSON.stringify(tempLikes) });
        }
    }

    public updateVoteForComment = async (pageurl, jsonLikes) => {
        let pageComment = await this._list.items.select('ID').filter(`PageURL eq '${pageurl}'`).get();
        if (pageComment.length > 0) {
            return await this._list.items.getById(pageComment[0].ID).update({ Likes: JSON.stringify(jsonLikes) });
        }
    }

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

    public isUserInAdminGroup = async (): Promise<boolean> => {
        try {
            // Get the current user
            const currentUser = await sp.web.currentUser.get();

            // First try checking if user is site admin
            if (currentUser.IsSiteAdmin) {
                return true;
            }

            // Fallback to checking custom admin group if it exists
            const adminGroupName = "Comment Administrators";
            try {
                const groupUsers = await sp.web.siteGroups.getByName(adminGroupName).users.get();
                return groupUsers.some(user => user.Id === currentUser.Id);
            } catch {
                // Group doesn't exist or other error - just return false
                return false;
            }
        } catch (error) {
            console.error("Error checking admin status:", error);
            return false;
        }
    };
    public deleteComment = async (pageurl, commentJson) => {
        const currentUser = await this.getCurrentUserInfo();
        const isAdmin = await this.isUserInAdminGroup();

        // Check if current user is comment creator or admin
        if (currentUser.ID !== commentJson.userid && !isAdmin) {
            throw new Error("You don't have permission to delete this comment");
        }

        // Remove the comment from the list of comments for the page
        let comments = await this.getComment(pageurl);
        if (comments !== undefined && comments !== null) {
            var jsonComments = JSON.parse(comments);

            // Get the ID of the comment to be deleted
            const commentId = commentJson.id;

            // Find all comments that need to be removed (the comment and all its nested replies)
            const commentsToRemove = new Set();

            // Add the initial comment to the removal set
            commentsToRemove.add(commentId);

            // Recursively find all replies at any nesting level
            const findAllReplies = (parentId) => {
                // Find direct replies to this parent
                const directReplies = jsonComments.filter(c => c.parent === parentId);

                // Add each direct reply to the removal set and recursively find its replies
                directReplies.forEach(reply => {
                    commentsToRemove.add(reply.id);
                    findAllReplies(reply.id);
                });
            };

            // Find all nested replies to the comment being deleted
            findAllReplies(commentId);

            // Remove all identified comments
            jsonComments = jsonComments.filter(comment => !commentsToRemove.has(comment.id));

            return await this.updateComment(pageurl, jsonComments);
        }
    };


    public editComments = async (pageurl, commentJson) => {
        const currentUser = await this.getCurrentUserInfo();
        const isAdmin = await this.isUserInAdminGroup();

        // Check if current user is comment creator or admin
        if (currentUser.ID !== commentJson.userid && !isAdmin) {
            throw new Error("You don't have permission to edit this comment");
        }

        let comment = await this.getComment(pageurl);
        if (comment !== undefined && comment !== null) {
            var jsonComments = JSON.parse(comment);
            var match = _.find(jsonComments, (o) => { return o.id == commentJson.id; });
            if (match) _.merge(match, { pings: commentJson.pings, content: commentJson.content, modified: commentJson.modified });
            return await this.updateComment(pageurl, jsonComments);
        }
    }

    public createFolder = async (folderPath) => {
        return await sp.web.folders.add(folderPath);
    }

    public uploadFileToFolder = async (folderpath, fileinfo) => {
        return await sp.web.getFolderByServerRelativeUrl(folderpath).files.add(fileinfo.name, fileinfo.content, true);
    }

    public postAttachments = async (commentArray: any[], pageFolderExists, postAttachmentPath): Promise<any> => {
        var self = this;
        return new Promise(async (resolve, reject) => {
            if (!pageFolderExists) await this.createFolder(postAttachmentPath);
            var reader = new FileReader();
            reader.onload = async () => {
                var contentBuffer = reader.result;
                let uploadedFile = await self.uploadFileToFolder(postAttachmentPath, { name: commentArray[0].file.name, content: contentBuffer });
                _.set(commentArray[0], 'file_id', uploadedFile.data.UniqueId);
                _.set(commentArray[0], 'file_url', postAttachmentPath + "/" + commentArray[0].file.name);
                resolve(commentArray);
            };
            await reader.readAsArrayBuffer(commentArray[0].file);
        });
    }

    public checkListExists = async (): Promise<boolean> => {
        return new Promise<boolean>(async (res, rej) => {
            sp.web.lists.getByTitle(this.lst_pageComments).get().then((listExists) => {
                res(true);
            }).catch(async err => {
                let listExists = await (await sp.web.lists.ensure(this.lst_pageComments)).list;
                await listExists.fields.addText('PageURL', 255, { Required: true, Description: '' });
                await listExists.fields.addMultilineText('Comments', 6, false, false, false, false, { Required: true, Description: '' });
                await listExists.fields.addMultilineText('Likes', 6, false, false, false, false, { Required: false, Description: '' });
                let allItemsView = await listExists.views.getByTitle('All Items');
                await allItemsView.fields.add('PageURL');
                await allItemsView.fields.add('Comments');
                await allItemsView.fields.add('Likes');
                res(true);
            });
        });
    }

}
